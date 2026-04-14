import { TextAttributes, type TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useRoute } from "@tui/context/route"
import { useSync } from "@tui/context/sync"
import { useLocal } from "@tui/context/local"
import { For, Show, createMemo, createSignal, createEffect, onMount } from "solid-js"
import { SessionPromptCache, type PromptKey } from "@/session/prompt-cache"
import { useSDK } from "@tui/context/sdk"
import { useToast } from "../ui/toast"

// Import prompts statically like system.ts does
import PROMPT_ANTHROPIC from "@/session/prompt/anthropic.txt"
import PROMPT_BEAST from "@/session/prompt/beast.txt"
import PROMPT_GEMINI from "@/session/prompt/gemini.txt"
import PROMPT_QWEN from "@/session/prompt/qwen.txt"
import PROMPT_CODEX from "@/session/prompt/codex_header.txt"

import PROMPT_TITLE from "@/agent/prompt/title.txt"
import PROMPT_SUMMARY from "@/agent/prompt/summary.txt"
import PROMPT_COMPACTION from "@/agent/prompt/compaction.txt"


export type DialogPromptsProps = {}

type PromptEntry = {
    name: string
    source: string
    type: "system" | "instruction" | "agent"
    content: string
    originalContent: string
    active?: boolean
    cacheKey: PromptKey
    isEdited?: boolean
}

export function DialogPrompts() {
    const { theme } = useTheme()
    const route = useRoute()
    const sync = useSync()
    const local = useLocal()
    const toast = useToast()
    const sdk = useSDK()

    // Get current session ID from route
    const sessionID = () => {
        const type = route.data.type
        const sid = type === "session" ? route.data.sessionID : undefined
        // toast.show({ message: `[SID] route.type=${type} sid=${sid?.slice(0, 8) || "NONE"}`, variant: sid ? "info" : "error" })
        return sid
    }

    // Fetch session data to hydrate cache if needed (client-side hydration)
    createEffect(async () => {
        const sid = sessionID()
        if (!sid) return

        try {
            const url = new URL(`session/${sid}`, sdk.url).toString()
            const fetchFn = sdk.fetch || fetch
            const res = await fetchFn(url)
            if (res.ok) {
                const session = await res.json()
                if (session.promptOverride) {
                    SessionPromptCache.set(sid, session.promptOverride.key, session.promptOverride.content)
                    setRefreshTrigger(x => x + 1)
                }
            }
        } catch (e) {
            console.error("Failed to fetch session info for prompts:", e)
        }
    })

    // State for selected entry (to expand details)
    const [selectedIdx, setSelectedIdx] = createSignal<number | null>(null)
    // State for edit mode
    const [editMode, setEditMode] = createSignal(false)
    // State for refresh trigger
    const [refreshTrigger, setRefreshTrigger] = createSignal(0)

    // Reference to textarea
    let textareaRef: TextareaRenderable | undefined

    // Actual save logic
    const doSave = async () => {
        const sid = sessionID()
        const idx = selectedIdx()
        const entry = idx !== null ? entries()[idx] : null

        // toast.show({ message: "[1] doSave entered", variant: "info" })

        if (!sid || idx === null || !textareaRef || !entry) {
            toast.show({ message: `[2] FAIL: sid=${sid} idx=${idx} ref=${!!textareaRef}`, variant: "error" })
            return
        }
        if (!editMode()) {
            toast.show({ message: "[3] FAIL: editMode is false", variant: "error" })
            return
        }

        const newContent = textareaRef.plainText?.trim()
        // toast.show({ message: `[4] content: ${newContent?.slice(0, 20) || "EMPTY"}`, variant: "info" })
        if (!newContent) {
            toast.show({ message: "[5] FAIL: empty content", variant: "error" })
            return
        }

        // toast.show({ message: `[6] writing key=${entry.cacheKey}`, variant: "info" })

        // 1. Update local cache (optimistic UI)
        SessionPromptCache.set(sid, entry.cacheKey, newContent)

        // 2. Push to server (for LLM process)
        try {
            const url = new URL(`session/${sid}/prompt`, sdk.url).toString()
            const fetchFn = sdk.fetch || fetch
            const res = await fetchFn(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: entry.cacheKey, content: newContent })
            })

            const text = await res.text()
            if (!res.ok) {
                toast.show({ message: `Save failed: ${res.status}`, variant: "error" })
                throw new Error(`Server returned ${res.status}`)
            }

            toast.show({ message: "Prompt saved", variant: "success" })
        } catch (err) {
            toast.show({ message: "Failed to save prompt", variant: "error" })
            console.error("Failed to sync prompt to server:", err)
        }

        setEditMode(false)
        setRefreshTrigger(r => r + 1)
    }

    // Get current model from local context (the actual user-selected model)
    const currentModel = createMemo(() => local.model.current())
    const modelParsed = createMemo(() => local.model.parsed())

    // Determine which system prompt is active
    const getActiveSystemPrompt = (modelID: string): string => {
        if (modelID.includes("gpt-5")) return "codex"
        if (modelID.includes("gpt-") || modelID.includes("o1") || modelID.includes("o3")) return "beast"
        if (modelID.includes("gemini-")) return "gemini"
        if (modelID.includes("claude")) return "anthropic"
        return "qwen"
    }

    // Build prompt entries from static imports
    const entries = createMemo((): PromptEntry[] => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        refreshTrigger() // dependency on refresh trigger
        const model = currentModel()
        const modelID = model?.modelID || ""
        const activeType = getActiveSystemPrompt(modelID)
        const sid = sessionID()

        const prompts: PromptEntry[] = []

        // System prompts
        const systemPrompts = [
            { name: "Anthropic", key: "anthropic", content: PROMPT_ANTHROPIC, source: "session/prompt/anthropic.txt" },
            { name: "Beast (GPT)", key: "beast", content: PROMPT_BEAST, source: "session/prompt/beast.txt" },
            { name: "Gemini", key: "gemini", content: PROMPT_GEMINI, source: "session/prompt/gemini.txt" },
            { name: "Qwen (Default)", key: "qwen", content: PROMPT_QWEN, source: "session/prompt/qwen.txt" },
            { name: "Codex Header", key: "codex", content: PROMPT_CODEX, source: "session/prompt/codex_header.txt" },
        ] as const

        for (const sp of systemPrompts) {
            const isActive = sp.key === activeType
            const cacheKey = `system:${sp.key}` as PromptKey
            const cachedContent = sid ? SessionPromptCache.get(sid, cacheKey) : undefined
            const isEdited = cachedContent !== undefined

            prompts.push({
                name: isActive ? `${sp.name} ★ ACTIVE` : sp.name,
                source: sp.source,
                type: "system",
                content: cachedContent ?? sp.content ?? "(empty)",
                originalContent: sp.content ?? "",
                active: isActive,
                cacheKey,
                isEdited,
            })
        }

        // Agent prompts
        const agentPrompts = [
            { name: "Title Generator", content: PROMPT_TITLE, source: "agent/prompt/title.txt", key: "title" },
            { name: "Summary Generator", content: PROMPT_SUMMARY, source: "agent/prompt/summary.txt", key: "summary" },
            { name: "Compaction", content: PROMPT_COMPACTION, source: "agent/prompt/compaction.txt", key: "compaction" },

        ] as const

        for (const ap of agentPrompts) {
            const cacheKey = `agent:${ap.key}` as PromptKey
            const cachedContent = sid ? SessionPromptCache.get(sid, cacheKey) : undefined
            const isEdited = cachedContent !== undefined

            prompts.push({
                name: ap.name,
                source: ap.source,
                type: "agent",
                content: cachedContent ?? ap.content ?? "(empty)",
                originalContent: ap.content ?? "",
                cacheKey,
                isEdited,
            })
        }

        return prompts
    })

    // Truncate long content for preview
    const truncateContent = (content: string, maxLen = 80) => {
        const firstLine = content.split("\n")[0] || ""
        if (firstLine.length <= maxLen) return firstLine
        return firstLine.slice(0, maxLen) + "..."
    }

    // Get type indicator color
    const getTypeColor = (type: PromptEntry["type"], active?: boolean) => {
        if (active) return theme.success
        switch (type) {
            case "system": return theme.primary
            case "instruction": return theme.info
            case "agent": return theme.warning
            default: return theme.text
        }
    }

    // Get type icon
    const getTypeIcon = (type: PromptEntry["type"]) => {
        switch (type) {
            case "system": return "●"
            case "instruction": return "◆"
            case "agent": return "▲"
            default: return "○"
        }
    }

    // Handler: Save edited prompt (delegates to doSave)
    const handleSave = () => {
        toast.show({ message: "[0] handleSave triggered", variant: "info" })
        doSave()
    }

    // Handler: Reset to original
    const handleReset = () => {
        const sid = sessionID()
        const idx = selectedIdx()
        if (!sid || idx === null) return

        const entry = entries()[idx]
        SessionPromptCache.remove(sid, entry.cacheKey)
        setEditMode(false)
        setRefreshTrigger(r => r + 1)
    }

    // Handler: Toggle edit mode
    const handleEdit = () => {
        const idx = selectedIdx()
        if (idx === null) return
        setEditMode(true)
    }

    // Handler: Cancel edit
    const handleCancelEdit = () => {
        setEditMode(false)
    }

    // Focus textarea when entering edit mode
    createEffect(() => {
        if (editMode() && textareaRef) {
            textareaRef.focus()
        }
    })

    return (
        <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1} flexDirection="column">
            {/* Header */}
            <box flexDirection="row" justifyContent="space-between">
                <box flexDirection="row" gap={2}>
                    <text fg={theme.text} attributes={TextAttributes.BOLD}>
                        Session Prompts
                    </text>
                    <Show when={modelParsed().model}>
                        <text fg={theme.textMuted}>
                            Model: {modelParsed().model}
                        </text>
                    </Show>
                </box>
                <text fg={theme.textMuted}>esc</text>
            </box>

            {/* Entry count */}
            <text fg={theme.textMuted}>
                {entries().length} prompts • ★ = active for current model • ✎ = edited
            </text>

            {/* Legend */}
            <box flexDirection="row" gap={2}>
                <text fg={theme.primary}>● System</text>
                <text fg={theme.warning}>▲ Agent</text>
                <text fg={theme.success}>★ Active</text>
            </box>

            {/* Entries list - when expanded, show only selected item */}
            <Show when={selectedIdx() !== null} fallback={
                <scrollbox maxHeight={14}>
                    <box flexDirection="column" gap={1}>
                        <For each={entries()}>
                            {(entry, idx) => (
                                <box
                                    flexDirection="column"
                                    onMouseUp={() => setSelectedIdx(idx())}
                                >
                                    <box flexDirection="row" gap={1}>
                                        <text
                                            flexShrink={0}
                                            fg={getTypeColor(entry.type, entry.active)}
                                        >
                                            {getTypeIcon(entry.type)}
                                        </text>
                                        <text
                                            fg={entry.active ? theme.success : theme.text}
                                            attributes={TextAttributes.BOLD}
                                            flexShrink={0}
                                        >
                                            {entry.name}
                                        </text>
                                        <Show when={entry.isEdited}>
                                            <text fg={theme.warning} flexShrink={0}>✎</text>
                                        </Show>
                                        <text fg={theme.textMuted} flexShrink={0}>
                                            [{entry.source.split(/[/\\]/).pop()}]
                                        </text>
                                    </box>
                                    <box paddingLeft={3}>
                                        <text fg={theme.textMuted}>
                                            {truncateContent(entry.content)}
                                        </text>
                                    </box>
                                </box>
                            )}
                        </For>
                    </box>
                </scrollbox>
            }>
                {/* Expanded single item view */}
                <box flexDirection="column">
                    <box flexDirection="row" gap={1}>
                        <text
                            fg={theme.primary}
                            onMouseUp={() => { setSelectedIdx(null); setEditMode(false) }}
                        >
                            ← Back
                        </text>
                        <text fg={theme.textMuted}>|</text>
                        <text
                            flexShrink={0}
                            fg={getTypeColor(entries()[selectedIdx()!].type, entries()[selectedIdx()!].active)}
                        >
                            {getTypeIcon(entries()[selectedIdx()!].type)}
                        </text>
                        <text
                            fg={entries()[selectedIdx()!].active ? theme.success : theme.text}
                            attributes={TextAttributes.BOLD}
                        >
                            {entries()[selectedIdx()!].name}
                        </text>
                        <Show when={entries()[selectedIdx()!].isEdited}>
                            <text fg={theme.warning}>✎ (edited)</text>
                        </Show>
                    </box>

                    {/* Action buttons */}
                    <box flexDirection="row" gap={2} paddingTop={1}>
                        <Show when={!editMode()}>
                            <text
                                fg={theme.info}
                                onMouseUp={handleEdit}
                            >
                                [Edit]
                            </text>
                        </Show>
                        <Show when={editMode()}>
                            <text
                                fg={theme.success}
                                onMouseUp={handleSave}
                            >
                                [Save]
                            </text>
                            <text
                                fg={theme.textMuted}
                                onMouseUp={handleCancelEdit}
                            >
                                [Cancel]
                            </text>
                        </Show>
                        <Show when={entries()[selectedIdx()!].isEdited}>
                            <text
                                fg={theme.warning}
                                onMouseUp={handleReset}
                            >
                                [Reset to Original]
                            </text>
                        </Show>
                    </box>

                    {/* Content view or edit mode */}
                    <box paddingLeft={1} paddingTop={1}>
                        <Show when={editMode()} fallback={
                            <scrollbox maxHeight={16}>
                                <text fg={theme.text} wrapMode="word">
                                    {entries()[selectedIdx()!].content}
                                </text>
                            </scrollbox>
                        }>
                            <textarea
                                height={16}
                                initialValue=""
                                placeholder="Enter your custom prompt here..."
                                ref={(val: TextareaRenderable) => { textareaRef = val }}
                                textColor={theme.text}
                                focusedTextColor={theme.text}
                                cursorColor={theme.text}
                                onSubmit={handleSave}
                                keyBindings={[{ name: "ctrl+shift+s", action: "submit" }]}
                            />
                        </Show>
                    </box>
                </box>
            </Show>

            {/* Footer hint */}
            <text fg={theme.textMuted}>
                Click entry to expand • {editMode() ? "Editing: Ctrl+Shift+S to save, Esc to cancel" : "Click Edit to modify"}
            </text>
        </box>
    )
}
