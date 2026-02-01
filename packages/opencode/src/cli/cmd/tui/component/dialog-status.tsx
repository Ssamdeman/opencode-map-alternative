import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { useArgs } from "@tui/context/args"
import { For, Match, Switch, Show, createMemo, createSignal } from "solid-js"
import { Installation } from "@/installation"

export type DialogStatusProps = {}

export function DialogStatus() {
  const sync = useSync()
  const { theme } = useTheme()
  const local = useLocal()
  const args = useArgs()

  // Get current provider info for verbose view
  const currentProvider = createMemo(() => {
    const model = local.model.current()
    if (!model) return undefined
    return sync.data.provider.find((p) => p.id === model.providerID)
  })

  // View mode state: 'standard' shows status list, 'verbose' shows detailed configuration
  const [viewMode, setViewMode] = createSignal<'standard' | 'verbose'>('standard')

  // Handle arrow key navigation between views
  useKeyboard((evt) => {
    if (evt.name === "right" && viewMode() === 'standard') {
      setViewMode('verbose')
      evt.preventDefault()
    }
    if (evt.name === "left" && viewMode() === 'verbose') {
      setViewMode('standard')
      evt.preventDefault()
    }
  })

  const enabledFormatters = createMemo(() => sync.data.formatter.filter((f) => f.enabled))

  const plugins = createMemo(() => {
    const list = sync.data.config.plugin ?? []
    const result = list.map((value) => {
      if (value.startsWith("file://")) {
        const path = value.substring("file://".length)
        const parts = path.split("/")
        const filename = parts.pop() || path
        if (!filename.includes(".")) return { name: filename }
        const basename = filename.split(".")[0]
        if (basename === "index") {
          const dirname = parts.pop()
          const name = dirname || basename
          return { name }
        }
        return { name: basename }
      }
      const index = value.lastIndexOf("@")
      if (index <= 0) return { name: value, version: "latest" }
      const name = value.substring(0, index)
      const version = value.substring(index + 1)
      return { name, version }
    })
    return result.toSorted((a, b) => a.name.localeCompare(b.name))
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <box flexDirection="row" gap={2}>
          <text
            fg={viewMode() === 'standard' ? theme.text : theme.textMuted}
            attributes={viewMode() === 'standard' ? TextAttributes.BOLD : undefined}
          >
            {viewMode() === 'standard' ? '[Status]' : 'Status'}
          </text>
          <text
            fg={viewMode() === 'verbose' ? theme.text : theme.textMuted}
            attributes={viewMode() === 'verbose' ? TextAttributes.BOLD : undefined}
          >
            {viewMode() === 'verbose' ? '[Verbose]' : 'Verbose'}
          </text>
          <text fg={theme.textMuted}>(←/→ to cycle)</text>
        </box>
        <text fg={theme.textMuted}>esc</text>
      </box>
      <Switch>
        <Match when={viewMode() === 'standard'}>
          <text fg={theme.textMuted}>MAP v{Installation.VERSION}</text>
          <Show when={Object.keys(sync.data.mcp).length > 0} fallback={<text fg={theme.text}>No MCP Servers</text>}>
            <box>
              <text fg={theme.text}>{Object.keys(sync.data.mcp).length} MCP Servers</text>
              <For each={Object.entries(sync.data.mcp)}>
                {([key, item]) => (
                  <box flexDirection="row" gap={1}>
                    <text
                      flexShrink={0}
                      style={{
                        fg: (
                          {
                            connected: theme.success,
                            failed: theme.error,
                            disabled: theme.textMuted,
                            needs_auth: theme.warning,
                            needs_client_registration: theme.error,
                          } as Record<string, typeof theme.success>
                        )[item.status],
                      }}
                    >
                      •
                    </text>
                    <text fg={theme.text} wrapMode="word">
                      <b>{key}</b>{" "}
                      <span style={{ fg: theme.textMuted }}>
                        <Switch fallback={item.status}>
                          <Match when={item.status === "connected"}>Connected</Match>
                          <Match when={item.status === "failed" && item}>{(val) => val().error}</Match>
                          <Match when={item.status === "disabled"}>Disabled in configuration</Match>
                          <Match when={(item.status as string) === "needs_auth"}>
                            Needs authentication (run: map mcp auth {key})
                          </Match>
                          <Match when={(item.status as string) === "needs_client_registration" && item}>
                            {(val) => (val() as { error: string }).error}
                          </Match>
                        </Switch>
                      </span>
                    </text>
                  </box>
                )}
              </For>
            </box>
          </Show>
          {sync.data.lsp.length > 0 && (
            <box>
              <text fg={theme.text}>{sync.data.lsp.length} LSP Servers</text>
              <For each={sync.data.lsp}>
                {(item) => (
                  <box flexDirection="row" gap={1}>
                    <text
                      flexShrink={0}
                      style={{
                        fg: {
                          connected: theme.success,
                          error: theme.error,
                        }[item.status],
                      }}
                    >
                      •
                    </text>
                    <text fg={theme.text} wrapMode="word">
                      <b>{item.id}</b> <span style={{ fg: theme.textMuted }}>{item.root}</span>
                    </text>
                  </box>
                )}
              </For>
            </box>
          )}
          <Show when={enabledFormatters().length > 0} fallback={<text fg={theme.text}>No Formatters</text>}>
            <box>
              <text fg={theme.text}>{enabledFormatters().length} Formatters</text>
              <For each={enabledFormatters()}>
                {(item) => (
                  <box flexDirection="row" gap={1}>
                    <text
                      flexShrink={0}
                      style={{
                        fg: theme.success,
                      }}
                    >
                      •
                    </text>
                    <text wrapMode="word" fg={theme.text}>
                      <b>{item.name}</b>
                    </text>
                  </box>
                )}
              </For>
            </box>
          </Show>
          <Show when={plugins().length > 0} fallback={<text fg={theme.text}>No Plugins</text>}>
            <box>
              <text fg={theme.text}>{plugins().length} Plugins</text>
              <For each={plugins()}>
                {(item) => (
                  <box flexDirection="row" gap={1}>
                    <text
                      flexShrink={0}
                      style={{
                        fg: theme.success,
                      }}
                    >
                      •
                    </text>
                    <text wrapMode="word" fg={theme.text}>
                      <b>{item.name}</b>
                      {item.version && <span style={{ fg: theme.textMuted }}> @{item.version}</span>}
                    </text>
                  </box>
                )}
              </For>
            </box>
          </Show>
        </Match>
        <Match when={viewMode() === 'verbose'}>
          <box gap={1}>
            <text fg={theme.text}>
              <b>Version:</b> <span style={{ fg: theme.textMuted }}>MAP v{Installation.VERSION}</span>
            </text>
            <text fg={theme.text}>
              <b>CWD:</b> <span style={{ fg: theme.textMuted }}>{sync.data.path.directory || 'Not set'}</span>
            </text>
            <text fg={theme.text}>
              <b>Model:</b> <span style={{ fg: theme.textMuted }}>{local.model.parsed().provider}/{local.model.parsed().model}</span>
            </text>
            <Show when={currentProvider()}>
              <text fg={theme.text}>
                <b>Base URL:</b> <span style={{ fg: theme.textMuted }}>{(currentProvider()?.options as { baseURL?: string })?.baseURL || 'Default'}</span>
              </text>
              <text fg={theme.text}>
                <b>Auth:</b> <span style={{ fg: theme.textMuted }}>{currentProvider()?.env?.join(', ') || 'Not configured'}</span>
              </text>
            </Show>
            <text fg={theme.text}>
              <b>Session ID:</b> <span style={{ fg: theme.textMuted }}>{args.sessionID || 'No active session'}</span>
            </text>
          </box>
        </Match>
      </Switch>
    </box>
  )
}
