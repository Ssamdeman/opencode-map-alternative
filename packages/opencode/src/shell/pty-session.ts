import { type IPty } from "bun-pty"
import { lazy } from "@/util/lazy"
import fs from "fs"
import { Shell } from "@/shell/shell"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { Identifier } from "@/id/id"
import { Pty } from "@/pty"

const log = Log.create({ service: "pty-session" })

const READY = "__MAP_READY__"

// All ANSI escape sequences + bare carriage returns
const ANSI_RE = /\x1b\[[0-9;]*[mGKHFJPXABCDEFMSTh]|\x1b\][^\x07]*\x07|\x1b[()][AB012]|\x1b[=>78|]|\r(?!\n)/g

// Interactive password / sudo prompts — silently excluded from agent output
const SENSITIVE = [/\bpassword:/i, /\bpassphrase:/i, /\bsudo:/i, /\[sudo\]/i]

const spawnPty = lazy(async () => {
  const { spawn } = await import("bun-pty")
  return spawn
})

function stripAnsi(raw: string) {
  return raw.replace(ANSI_RE, "")
}

function filterSensitive(lines: string[]) {
  return lines.filter((l) => !SENSITIVE.some((p) => p.test(l)))
}

/**
 * PtySession — PTY-backed persistent shell for pentest sub-agents.
 *
 * Replaces ShellSession's pipe+sentinel-poll model with a real PTY and
 * PS1-based completion detection. API surface is identical to ShellSession:
 * `getInstance(sessionID, agent?)` + `execute(command, timeout?)`.
 *
 * Lifecycle:
 *   - Spawned lazily on first `execute()` call (via `ensureInit`)
 *   - PS1 is set to `__MAP_READY__ ` so every completed command fires the sentinel
 *   - After init, `Pty.register()` takes over the single onData slot for WS streaming
 *     and Bus event batching. PtySession's accumulation callback is passed to register().
 *   - Output is ANSI-stripped before being returned to the agent
 *   - Sensitive lines (password prompts) are silently excluded (Phase 4 handles UI interrupts)
 *   - Terminated via `PtySession.terminate(sessionID)` during session cleanup
 */
export class PtySession {
  private static instances = new Map<string, PtySession>()

  private proc: IPty | null = null
  private initPromise: Promise<void> | null = null
  private buf = ""
  private executing = false
  private registered = false   // true only after Pty.register() completes in init()
  readonly ptyId: string
  private backgroundLog: string | null = null


  private constructor(
    readonly sessionID: string,
    private readonly agent?: string,
  ) {
    this.ptyId = Identifier.create("pty", false)
  }

  static getInstance(sessionID: string, agent?: string): PtySession {
    const hit = PtySession.instances.get(sessionID)
    if (hit) return hit
    const session = new PtySession(sessionID, agent)
    PtySession.instances.set(sessionID, session)
    return session
  }

  static terminate(sessionID: string): void {
    PtySession.instances.get(sessionID)?.kill()
  }

  /** Returns the ptyID only after Pty.register() has been called (shell ready + in Pty.state). */
  static getPtyId(sessionID: string): string | undefined {
    const s = PtySession.instances.get(sessionID)
    return s?.registered ? s.ptyId : undefined
  }

  private kill(): void {
    try {
      this.proc?.kill()
    } catch {}
    if (PtySession.instances.get(this.sessionID) === this) {
      PtySession.instances.delete(this.sessionID)
    }
  }

  /**
   * Detaches the session from the sessionID mapping.
   * The session will continue to run in the background, writing output to logPath.
   * A fresh shell will be spawned on the next getInstance() call for this sessionID.
   */
  detach(logPath: string): string {
    const partial = this.buf.split(READY)[0]
    this.backgroundLog = logPath
    log.info("detaching session to background", { sessionID: this.sessionID, logPath })
    
    // Remove from the active map so next call gets a new shell
    if (PtySession.instances.get(this.sessionID) === this) {
      PtySession.instances.delete(this.sessionID)
    }
    
    return partial
  }

  private ensureInit(): Promise<void> {
    if (this.proc) return Promise.resolve()
    if (this.initPromise) return this.initPromise
    this.initPromise = this.init()
    return this.initPromise
  }

  private async init(): Promise<void> {
    const spawn = await spawnPty()

    const [cmd, args] =
      process.platform === "win32"
        ? (["powershell.exe", ["-NoProfile", "-NoLogo"]] as const)
        : ([Shell.preferred(), [] as string[]] as const)

    const cwd = process.env.HOME ?? process.env.USERPROFILE ?? Instance.directory
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      OPENCODE_TERMINAL: "1",
    } as Record<string, string>

    log.info("spawning pty session", { sessionID: this.sessionID, cmd, cwd })

    this.proc = spawn(cmd, [...args], { name: "xterm-256color", cwd, env })

    // Phase 1: init-only onData handler — tracks the PS1 sentinel to detect shell readiness.
    // This handler is REPLACED by Pty.register() once init completes.
    let ready = false

    this.proc.onData((data: string) => {
      if (!ready) {
        this.buf += data
        if (this.buf.includes(READY)) {
          ready = true
          this.buf = "" // discard startup noise
        }
      }
      // NB: no execute-phase accumulation here — Pty.register() takes that over
    })

    this.proc.onExit(() => {
      log.info("pty session exited", { sessionID: this.sessionID })
      this.proc = null
      this.initPromise = null
      PtySession.instances.delete(this.sessionID)
    })

    // Set PS1 to sentinel string. On PowerShell, override the prompt function.
    const setup =
      process.platform === "win32"
        ? `function prompt { '${READY} ' }\r\n`
        : `export PS1='${READY} '\n`

    this.proc.write(setup)

    // Block until shell confirms it's ready (first sentinel in output)
    await new Promise<void>((resolve) => {
      const poll = setInterval(() => {
        if (!ready) return
        clearInterval(poll)
        resolve()
      }, 50)
    })

    // Phase 2: hand the single onData slot to Pty.register().
    // From here, Pty owns WS streaming + Bus batching.
    // Our accumulation callback fires only while `this.executing`.
    Pty.register(this.proc, {
      id: this.ptyId,
      title: `${this.agent ?? "agent"} terminal`,
      cwd,
      onData: (data) => {
        if (this.executing) {
          this.buf += data
          if (this.backgroundLog) {
            // Background logging: write raw data (ANSI stripped later on read or kept for realism)
            try {
              fs.appendFileSync(this.backgroundLog, data)
            } catch (e) {
              console.error("[PtySession] Background log write failed:", e)
            }
          }
        }
      },
    })
    this.registered = true   // ← gate: getPtyId() now returns this ID

    log.info("pty session ready and registered", { sessionID: this.sessionID, ptyId: this.ptyId })
  }

  execute(command: string, timeoutMs?: number, onProgress?: (output: string) => void, progressIntervalMs?: number): Promise<string> {
    return this.ensureInit().then(() => this.run(command, timeoutMs, onProgress, progressIntervalMs))
  }

  private run(command: string, timeoutMs?: number, onProgress?: (output: string) => void, progressIntervalMs?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.buf = ""
      this.executing = true

      const ms = timeoutMs ?? Flag.OPENCODE_SHELL_TIMEOUT
      const progressInt = progressIntervalMs ?? 3000

      const timer = setTimeout(() => {
        this.executing = false
        reject(new Error(`[PtySession] command timed out after ${ms}ms`))
      }, ms)

      let lastProgress = Date.now()

      const poll = setInterval(() => {
        if (!this.buf.includes(READY)) {
          if (onProgress) {
            const now = Date.now()
            if (now - lastProgress > progressInt) {
              lastProgress = now
              const raw = this.buf
              const cleaned = stripAnsi(raw)
              const lines = cleaned.split("\n")
              const partial = filterSensitive(lines.slice(1)).join("\n").trim()
              if (partial) {
                onProgress(partial)
              }
            }
          }
          return
        }
        clearTimeout(timer)
        clearInterval(poll)
        this.executing = false

        // If we were detaching, the promise might have already been "resolved" 
        // by the caller (BashTool) or we resolve it here if NOT detached.
        // Actually, BashTool handles the "return" if it calls detach.
        // But we must stop the poll and clean up.

        // Everything before the sentinel is command echo + actual output
        const raw = this.buf.split(READY)[0]
        const cleaned = stripAnsi(raw)
        const lines = cleaned.split("\n")

        // Drop first line — it is the echoed command written to the PTY
        const output = filterSensitive(lines.slice(1)).join("\n").trim()
        
        // If this session was backgrounded, it's now finished.
        if (this.backgroundLog) {
          log.info("background session finished", { sessionID: this.sessionID })
          this.kill()
        }
        
        resolve(output)
      }, 50)

      this.proc!.write(`${command}\n`)
    })
  }
}
