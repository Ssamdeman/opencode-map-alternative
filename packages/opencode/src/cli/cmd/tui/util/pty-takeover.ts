import { useRenderer } from "@opentui/solid"

/**
 * PtyTakeover — suspends the opentui renderer and gives full-screen raw PTY access
 * to the active sub-agent's terminal. Triggered by the agent_terminal keybind.
 *
 * Exit methods (platform-reliable):
 *   1. Primary  — Ctrl+C (\x03) — universal on Windows and Unix
 *   2. Fallback — three consecutive ESC presses within 500ms
 *
 * Note: ctrl+alt+t raw byte sequences are NOT used for exit detection because
 * they differ across terminal emulators and do not work reliably on Windows.
 */
export namespace PtyTakeover {
  let active = false
  let cleanup: (() => void) | null = null

  export function toggle(ptyID: string, renderer: ReturnType<typeof useRenderer>, serverUrl: string) {
    active ? exit(renderer) : enter(ptyID, renderer, serverUrl)
  }

  export function isActive() {
    return active
  }

  function enter(ptyID: string, renderer: ReturnType<typeof useRenderer>, serverUrl: string) {
    active = true
    renderer.suspend()

    // Print a visible header so the user knows how to exit
    process.stdout.write("\r\n\x1b[2m[MAP PTY — Ctrl+C or ESC×3 to return to TUI]\x1b[0m\r\n")

    // Convert http(s):// → ws(s)://
    const wsBase = serverUrl.replace(/^http/, "ws")
    const wsUrl = `${wsBase}/pty/${ptyID}/connect`

    const ws = new WebSocket(wsUrl)

    // PTY → stdout (raw ANSI passthrough)
    ws.onmessage = (e) => {
      process.stdout.write(String(e.data))
    }

    // Only exit automatically if the WS actually opened — a failed connect
    // (session-not-found, ptyID not yet in Pty.state) must not snap back.
    let wsOpened = false
    ws.onopen = () => { wsOpened = true }

    ws.onclose = () => {
      if (active && wsOpened) exit(renderer)
    }

    process.stdin.setRawMode(true)

    let escCount = 0
    let escTimer: NodeJS.Timeout | null = null

    const onData = (chunk: Buffer) => {
      const str = chunk.toString()

      // Primary exit: Ctrl+C (\x03) — works on all platforms / all terminal emulators
      if (str === "\x03") {
        exit(renderer)
        return
      }

      // Fallback exit: triple-ESC within 500ms
      if (str === "\x1b") {
        escCount++
        if (escTimer) clearTimeout(escTimer)
        if (escCount >= 3) {
          escCount = 0
          exit(renderer)
          return
        }
        escTimer = setTimeout(() => { escCount = 0 }, 500)
        // Swallow bare ESC while counting — don't forward yet
        return
      }

      // Flush any pending ESCs before forwarding non-ESC input
      if (escCount > 0) {
        for (let i = 0; i < escCount; i++) {
          if (ws.readyState === WebSocket.OPEN) ws.send("\x1b")
        }
        escCount = 0
        if (escTimer) { clearTimeout(escTimer); escTimer = null }
      }

      if (ws.readyState === WebSocket.OPEN) ws.send(str)
    }

    // Delay registering the stdin handler by 150ms.
    // The keypress that triggered enter() may still be buffered in stdin —
    // registering immediately risks acting on it before the user types anything.
    let registerTimer: NodeJS.Timeout | null = setTimeout(() => {
      registerTimer = null
      process.stdin.on("data", onData)
    }, 150)

    cleanup = () => {
      if (registerTimer) { clearTimeout(registerTimer); registerTimer = null }
      process.stdin.setRawMode(false)
      process.stdin.off("data", onData)
      if (escTimer) clearTimeout(escTimer)
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }

  function exit(renderer: ReturnType<typeof useRenderer>) {
    active = false
    cleanup?.()
    cleanup = null
    renderer.resume()
  }
}
