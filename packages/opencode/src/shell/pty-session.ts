import { type IPty } from "bun-pty"
import { lazy } from "@/util/lazy"
import { Shell } from "@/shell/shell"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"

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
 * `getInstance(sessionID)` + `execute(command, timeout?)`.
 *
 * Lifecycle:
 *   - Spawned lazily on first `execute()` call (via `ensureInit`)
 *   - PS1 is set to `__MAP_READY__ ` so every completed command fires the sentinel
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

  private constructor(readonly sessionID: string) {}

  static getInstance(sessionID: string): PtySession {
    const hit = PtySession.instances.get(sessionID)
    if (hit) return hit
    const session = new PtySession(sessionID)
    PtySession.instances.set(sessionID, session)
    return session
  }

  static terminate(sessionID: string): void {
    PtySession.instances.get(sessionID)?.kill()
  }

  private kill(): void {
    try {
      this.proc?.kill()
    } catch {}
    PtySession.instances.delete(this.sessionID)
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

    // Single onData handler covers both init phase and execute phase.
    // `ready` flips once the PS1 sentinel first appears, confirming the shell
    // is up and the custom prompt is active.
    let ready = false

    this.proc.onData((data: string) => {
      if (!ready) {
        // Accumulate startup noise until sentinel appears once
        this.buf += data
        if (this.buf.includes(READY)) {
          ready = true
          this.buf = "" // discard startup noise
        }
        return
      }
      // After init: only buffer when a command is in-flight
      if (this.executing) this.buf += data
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

    log.info("pty session ready", { sessionID: this.sessionID })
  }

  execute(command: string, timeoutMs?: number): Promise<string> {
    return this.ensureInit().then(() => this.run(command, timeoutMs))
  }

  private run(command: string, timeoutMs?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      this.buf = ""
      this.executing = true

      const ms = timeoutMs ?? Flag.OPENCODE_SHELL_TIMEOUT

      const timer = setTimeout(() => {
        this.executing = false
        reject(new Error(`[PtySession] command timed out after ${ms}ms`))
      }, ms)

      const poll = setInterval(() => {
        if (!this.buf.includes(READY)) return
        clearTimeout(timer)
        clearInterval(poll)
        this.executing = false

        // Everything before the sentinel is command echo + actual output
        const raw = this.buf.split(READY)[0]
        const cleaned = stripAnsi(raw)
        const lines = cleaned.split("\n")

        // Drop first line — it is the echoed command written to the PTY
        const output = filterSensitive(lines.slice(1)).join("\n").trim()
        resolve(output)
      }, 50)

      this.proc!.write(`${command}\n`)
    })
  }
}
