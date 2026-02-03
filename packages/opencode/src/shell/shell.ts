import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import path from "path"
import { spawn, type ChildProcess } from "child_process"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", () => resolve())
        killer.once("error", () => resolve())
      })
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (_e) {
      proc.kill("SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }
  const BLACKLIST = new Set(["fish", "nu"])

  function fallback() {
    if (process.platform === "win32") {
      // MAP: Force PowerShell on Windows for pentesting platform
      return "powershell.exe"
    }
    if (process.platform === "darwin") return "/bin/zsh"
    const bash = Bun.which("bash")
    if (bash) return bash
    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    // MAP: Always use PowerShell on Windows, ignore $SHELL
    if (process.platform === "win32") {
      return "powershell.exe"
    }
    const s = process.env.SHELL
    if (s) return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    // MAP: Always use PowerShell on Windows
    if (process.platform === "win32") {
      return "powershell.exe"
    }
    const s = process.env.SHELL
    if (s && !BLACKLIST.has(path.basename(s))) return s
    return fallback()
  })
}
