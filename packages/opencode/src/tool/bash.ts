import z from "zod"
import { Tool } from "./tool"
import path from "path"
import DESCRIPTION from "./bash.txt"
import { Log } from "../util/log"
import { Instance } from "../project/instance"
import { lazy } from "@/util/lazy"
import { Language } from "web-tree-sitter"

import { $ } from "bun"
import { Filesystem } from "@/util/filesystem"
import { fileURLToPath } from "url"
import { Flag } from "@/flag/flag.ts"
import { Shell } from "@/shell/shell"
import { ShellSession } from "@/shell/shell-session"
import { PtySession } from "@/shell/pty-session"

const PENTEST_AGENTS = new Set(["recon", "explorer", "coder", "report"])

import { BashArity } from "@/permission/arity"
import { Truncate } from "./truncation"
import { Bus } from "@/bus"
import { TuiEvent } from "@/cli/cmd/tui/event"
import { Benchmark } from "@/benchmark/benchmark"
import { interpretPentestResult } from "./command-semantics"

const MAX_METADATA_LENGTH = 30_000
const DEFAULT_TIMEOUT = Flag.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS || 2 * 60 * 1000
const PENTEST_BACKGROUND_BUDGET_MS = 30_000

export const log = Log.create({ service: "bash-tool" })

const resolveWasm = (asset: string) => {
  if (asset.startsWith("file://")) return fileURLToPath(asset)
  if (asset.startsWith("/") || /^[a-z]:/i.test(asset)) return asset
  const url = new URL(asset, import.meta.url)
  return fileURLToPath(url)
}

const parser = lazy(async () => {
  const { Parser } = await import("web-tree-sitter")
  const { default: treeWasm } = await import("web-tree-sitter/tree-sitter.wasm" as string, {
    with: { type: "wasm" },
  })
  const treePath = resolveWasm(treeWasm)
  await Parser.init({
    locateFile() {
      return treePath
    },
  })
  const { default: bashWasm } = await import("tree-sitter-bash/tree-sitter-bash.wasm" as string, {
    with: { type: "wasm" },
  })
  const bashPath = resolveWasm(bashWasm)
  const bashLanguage = await Language.load(bashPath)
  const p = new Parser()
  p.setLanguage(bashLanguage)
  return p
})

const timeoutCounters = new Map<string, number>()

export const BashTool = Tool.define("bash", async () => {
  const shell = Shell.acceptable()
  log.info("bash tool using shell", { shell })

  return {
    description: DESCRIPTION.replaceAll("${directory}", Instance.directory)
      .replaceAll("${maxLines}", String(Truncate.MAX_LINES))
      .replaceAll("${maxBytes}", String(Truncate.MAX_BYTES)),
    parameters: z.object({
      command: z.string().describe("The command to execute"),
      timeout: z.number().describe("Optional timeout in milliseconds").optional(),
      workdir: z
        .string()
        .describe(
          `The working directory to run the command in. Defaults to ${Instance.directory}. Use this instead of 'cd' commands.`,
        )
        .optional(),
      description: z
        .string()
        .describe(
          "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
        ),
      run_in_background: z
        .boolean()
        .describe("If true, the command will run in the background and return a task ID immediately.")
        .optional(),
    }),
    async execute(params, ctx) {
      const cwd = params.workdir || Instance.directory
      if (params.timeout !== undefined && params.timeout < 0) {
        throw new Error(`Invalid timeout value: ${params.timeout}. Timeout must be a positive number.`)
      }
      const timeout = params.timeout ?? DEFAULT_TIMEOUT
      const tree = await parser().then((p) => p.parse(params.command))
      if (!tree) {
        throw new Error("Failed to parse command")
      }
      // MAP: External directory restrictions disabled for pentesting access
      // const directories = new Set<string>()
      // if (!Instance.containsPath(cwd)) directories.add(cwd)
      const patterns = new Set<string>()
      const always = new Set<string>()

      for (const node of tree.rootNode.descendantsOfType("command")) {
        if (!node) continue
        const command = []
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i)
          if (!child) continue
          if (
            child.type !== "command_name" &&
            child.type !== "word" &&
            child.type !== "string" &&
            child.type !== "raw_string" &&
            child.type !== "concatenation"
          ) {
            continue
          }
          command.push(child.text)
        }

        // not an exhaustive list, but covers most common cases
        if (["cd", "rm", "cp", "mv", "mkdir", "touch", "chmod", "chown", "cat"].includes(command[0])) {
          for (const arg of command.slice(1)) {
            if (arg.startsWith("-") || (command[0] === "chmod" && arg.startsWith("+"))) continue
            const resolved = await $`realpath ${arg}`
              .cwd(cwd)
              .quiet()
              .nothrow()
              .text()
              .then((x) => x.trim())
            log.info("resolved path", { arg, resolved })
            if (resolved) {
              // Git Bash on Windows returns Unix-style paths like /c/Users/...
              const normalized =
                process.platform === "win32" && resolved.match(/^\/[a-z]\//)
                  ? resolved.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\\`).replace(/\//g, "\\")
                  : resolved
              // MAP: Directory tracking disabled - unrestricted access
              // if (!Instance.containsPath(normalized)) directories.add(normalized)
            }
          }
        }

        // cd covered by above check
        if (command.length && command[0] !== "cd") {
          patterns.add(command.join(" "))
          always.add(BashArity.prefix(command).join(" ") + "*")
        }
      }

      // MAP: External directory permission check disabled for pentesting
      // if (directories.size > 0) {
      //   await ctx.ask({
      //     permission: "external_directory",
      //     patterns: Array.from(directories),
      //     always: Array.from(directories).map((x) => path.dirname(x) + "*"),
      //     metadata: {},
      //   })
      // }

      if (patterns.size > 0) {
        await ctx.ask({
          permission: "bash",
          patterns: Array.from(patterns),
          always: Array.from(always),
          metadata: {},
        })
      }

      const isPentestAgent = PENTEST_AGENTS.has(ctx.agent)
      const getSession = () => isPentestAgent
        ? PtySession.getInstance(ctx.sessionID, ctx.agent)
        : ShellSession.getInstance(ctx.sessionID)
        
      const terminateSession = () => isPentestAgent
        ? PtySession.terminate(ctx.sessionID)
        : ShellSession.terminate(ctx.sessionID)

      let output = ""
      let timedOut = false
      let aborted = false
      let wasReset = false
      let backgroundTaskId: string | null = null
      let backgroundLogPath: string | null = null

      // Initialize metadata with empty output
      ctx.metadata({
        metadata: {
          output: "",
          description: params.description,
        },
      })

      // Check if already aborted
      if (ctx.abort.aborted) {
        aborted = true
      }

      let attempts = 0
      while (attempts < 5 && !aborted) {
        attempts++
        timedOut = false
        const session = getSession()

        let timeoutTimer: ReturnType<typeof setTimeout>
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            timedOut = true
            reject(new Error(`Command timed out after ${timeout}ms`))
          }, timeout)
        })

        let abortHandler: (() => void) | undefined
        const abortPromise = new Promise<never>((_, reject) => {
          abortHandler = () => {
            aborted = true
            reject(new Error("Command aborted by user"))
          }
          if (ctx.abort.aborted) {
            abortHandler()
          } else {
            ctx.abort.addEventListener("abort", abortHandler, { once: true })
          }
        })

        try {
          const budgetPromise = isPentestAgent 
            ? new Promise<void>((resolve) => setTimeout(resolve, PENTEST_BACKGROUND_BUDGET_MS))
            : new Promise<void>(() => {}) // Never resolves for non-pentest agents

          // If explicit backgrounding is requested, detach immediately
          if (params.run_in_background) {
            const timestamp = Date.now()
            const logName = `bg-${ctx.sessionID}-${timestamp}.log`
            backgroundLogPath = path.join(Instance.directory, ".opencode", "shared-resources", "bg-tasks", logName)
            backgroundTaskId = `task-${timestamp}`
            
            // Start the command
            const cmdPromise = session.execute(params.command, timeout)
            // Immediately detach
            output = session.detach(backgroundLogPath)
            
            break // Exit the retry loop
          }

          const cmdOutput = await Promise.race([
            session.execute(params.command, timeout).then(res => ({ type: "done" as const, data: res })),
            timeoutPromise.then(() => ({ type: "timeout" as const })),
            abortPromise.then(() => ({ type: "abort" as const })),
            budgetPromise.then(() => ({ type: "budget" as const })),
          ])

          if (cmdOutput.type === "budget") {
            const timestamp = Date.now()
            const logName = `bg-${ctx.sessionID}-${timestamp}.log`
            backgroundLogPath = path.join(Instance.directory, ".opencode", "shared-resources", "bg-tasks", logName)
            backgroundTaskId = `task-${timestamp}`
            
            output = session.detach(backgroundLogPath)
            log.info("auto-backgrounded long running command", { sessionID: ctx.sessionID, taskId: backgroundTaskId })
            break
          }

          if (cmdOutput.type === "timeout") throw new Error(`Command timed out after ${timeout}ms`)
          if (cmdOutput.type === "abort") throw new Error("Command aborted by user")
          
          const result = cmdOutput.data as string
          
          Benchmark.bashCommand(ctx.sessionID, ctx.agent ?? "unknown")
          // Debug: Get current working directory for visibility
          const debugPwd = await session.execute(
            process.platform === "win32" ? "(Get-Location).Path" : "pwd",
            5000
          )
          output = `${result}\n[MAP:DEBUG] cwd=${debugPwd.trim()}`
          
          // Success! Reset consecutive timeout counter
          timeoutCounters.set(ctx.sessionID, 0)
          break
        } catch (error) {
          if (timedOut) {
            const count = (timeoutCounters.get(ctx.sessionID) || 0) + 1
            timeoutCounters.set(ctx.sessionID, count)

            if (attempts < 5) {
              if (count >= 3) {
                log.warn(`Shell reset triggered for session ${ctx.sessionID} after 3 consecutive timeouts.`)
                terminateSession()
                wasReset = true
                timeoutCounters.set(ctx.sessionID, 0)
              }
              
              // Wait 30 seconds before retrying
              await new Promise((resolve) => setTimeout(resolve, 30000))
              continue
            }
          }

          if (!timedOut && !aborted) {
            output = `Error executing command: ${error}`
          }
          break
        } finally {
          clearTimeout(timeoutTimer!)
          if (abortHandler) {
            ctx.abort.removeEventListener("abort", abortHandler)
          }
        }
      }

      // Update metadata with final output
      ctx.metadata({
        metadata: {
          output: output.length > MAX_METADATA_LENGTH
            ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..."
            : output,
          description: params.description,
        },
      })

      const resultMetadata: string[] = []

      if (wasReset) {
        resultMetadata.push("WARNING: Shell was reset after repeated timeouts. The output below is from the retried command on a fresh shell.")
      }

      if (timedOut) {
        resultMetadata.push(`bash tool terminated command after exceeding timeout ${timeout} ms`)
      }

      if (aborted) {
        resultMetadata.push("User aborted the command")
      }

      if (backgroundTaskId) {
        const relLogPath = path.relative(Instance.directory, backgroundLogPath!)
        resultMetadata.push(`Command is running in background. Task ID: ${backgroundTaskId}`)
        resultMetadata.push(`Ongoing output is being written to: ${relLogPath}`)
        resultMetadata.push(`Use 'bash' with 'cat ${relLogPath}' to read full output when ready.`)
        if (isPentestAgent && !params.run_in_background) {
          resultMetadata.push(`This command was automatically backgrounded because it exceeded the ${PENTEST_BACKGROUND_BUDGET_MS/1000}s budget.`)
        }
      }

      let caughtExitCode = timedOut || aborted ? 1 : 0
      if (output.startsWith("Error executing command:")) {
        caughtExitCode = 1 // default to non-zero on error catch
      }

      let isExpectedExit = false

      if (isPentestAgent) {
        const semantics = interpretPentestResult(params.command, caughtExitCode, output)
        isExpectedExit = !semantics.isError

        if (!semantics.isError) {
          if (semantics.message) {
            resultMetadata.push(`Semantics: ${semantics.message}`)
          }
        } else if (caughtExitCode !== 0) {
          resultMetadata.push(`Exit code: ${caughtExitCode}`)
        }
      } else if (caughtExitCode !== 0) {
        resultMetadata.push(`Exit code: ${caughtExitCode}`)
      }

      if (resultMetadata.length > 0) {
        output += "\n\n<bash_metadata>\n" + resultMetadata.join("\n") + "\n</bash_metadata>"
      }

      return {
        title: params.description,
        metadata: {
          output: output.length > MAX_METADATA_LENGTH ? output.slice(0, MAX_METADATA_LENGTH) + "\n\n..." : output,
          exit: caughtExitCode,
          isExpectedExit,
          description: params.description,
        },
        output,
      }
    },
  }
})