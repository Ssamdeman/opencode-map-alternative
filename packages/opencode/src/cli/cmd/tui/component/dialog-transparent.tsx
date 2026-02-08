import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { For, Show, createResource, createSignal } from "solid-js"
import path from "path"
import { Global } from "@/global"

export type DialogTransparentProps = {}

type TransparentEntry = {
    id: string
    timestamp: number
    type: "request" | "response"
    data: Record<string, unknown>
}

export function DialogTransparent() {
    const { theme } = useTheme()
    const route = useRoute()
    const sync = useSync()

    // Get current session ID from route
    const sessionID = () => (route.data.type === "session" ? route.data.sessionID : undefined)

    // Get session info for title
    const session = () => {
        const id = sessionID()
        if (!id) return undefined
        return sync.session.get(id)
    }

    // State for selected entry (to expand details)
    const [selectedIdx, setSelectedIdx] = createSignal<number | null>(null)

    // Fetch transparent log data directly from file
    const [entries] = createResource(
        sessionID,
        async (id) => {
            if (!id) return []
            try {
                const filepath = path.join(Global.Path.data, "transparent", `${id}.json`)
                const file = Bun.file(filepath)
                if (!(await file.exists())) return []
                const data = await file.json()
                return Array.isArray(data) ? (data as TransparentEntry[]) : []
            } catch {
                return []
            }
        },
        { initialValue: [] }
    )

    // Format timestamp to readable time
    const formatTime = (ts: number) => {
        const date = new Date(ts)
        return date.toLocaleTimeString()
    }

    // Truncate long JSON for preview
    const truncateJson = (data: Record<string, unknown>, maxLen = 60) => {
        const str = JSON.stringify(data)
        if (str.length <= maxLen) return str
        return str.slice(0, maxLen) + "..."
    }

    return (
        <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1} flexDirection="column">
            {/* Header with session ID */}
            <box flexDirection="row" justifyContent="space-between">
                <box flexDirection="row" gap={2}>
                    <text fg={theme.text} attributes={TextAttributes.BOLD}>
                        Transparent Log
                    </text>
                    <Show when={session()}>
                        <text fg={theme.textMuted}>
                            {sessionID()?.slice(0, 20)}...
                        </text>
                    </Show>
                </box>
                <text fg={theme.textMuted}>esc</text>
            </box>

            {/* Entry count */}
            <text fg={theme.textMuted}>
                {entries().length} {entries().length === 1 ? "entry" : "entries"}
            </text>

            {/* Entries list */}
            <Show
                when={entries().length > 0}
                fallback={
                    <text fg={theme.textMuted}>
                        No transparent log data. Send a message to see AI I/O logs.
                    </text>
                }
            >
                <scrollbox maxHeight={18}>
                    <box flexDirection="column" gap={1}>
                        <For each={entries()}>
                            {(entry, idx) => (
                                <box
                                    flexDirection="column"
                                    onMouseUp={() => setSelectedIdx(selectedIdx() === idx() ? null : idx())}
                                >
                                    <box flexDirection="row" gap={1}>
                                        <text
                                            flexShrink={0}
                                            fg={entry.type === "request" ? theme.primary : theme.success}
                                        >
                                            {entry.type === "request" ? "→" : "←"}
                                        </text>
                                        <text fg={theme.textMuted} flexShrink={0}>
                                            [{formatTime(entry.timestamp)}]
                                        </text>
                                        <text fg={theme.text} attributes={TextAttributes.BOLD} flexShrink={0}>
                                            {entry.type.toUpperCase()}
                                        </text>
                                        <Show when={selectedIdx() !== idx()}>
                                            <text fg={theme.textMuted}>
                                                {truncateJson(entry.data)}
                                            </text>
                                        </Show>
                                    </box>
                                    {/* Expanded view */}
                                    <Show when={selectedIdx() === idx()}>
                                        <box paddingLeft={3}>
                                            <text fg={theme.text} wrapMode="word">
                                                {JSON.stringify(entry.data, null, 2)}
                                            </text>
                                        </box>
                                    </Show>
                                </box>
                            )}
                        </For>
                    </box>
                </scrollbox>
            </Show>

            {/* Footer hint */}
            <text fg={theme.textMuted}>Click entry to expand • Raw AI I/O data</text>
        </box>
    )
}
