import { TextAttributes, type TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { createSignal, createEffect, For, Show, createMemo } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import { useRoute } from "../context/route"
import { useLocal } from "../context/local"
import { Identifier } from "@/id/id"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { DialogModel } from "./dialog-model"
import { DialogTextEdit } from "./dialog-text-edit"

export type DialogEngagementState = {
    draftValues?: Record<string, string>
    isSettingsOpen?: boolean
    aiSettings?: {
        providerID?: string
        modelID?: string
        prompt?: string
    }
}

export function DialogEngagement(props: { sessionID?: string; initialState?: DialogEngagementState }) {
    const { theme } = useTheme()
    const dialog = useDialog()
    const toast = useToast()
    const sync = useSync()
    const sdk = useSDK()
    const route = useRoute()
    const local = useLocal()

    // Field definitions
    const fields = [
        { key: "name", label: "Engagement Name", placeholder: "e.g. Red Team Assessment 2024" },
        { key: "scope", label: "Scope", placeholder: "Define the boundaries..." },
        { key: "targets", label: "Targets", placeholder: "List IP ranges, domains, or assets..." },
        { key: "exclusions", label: "Exclusions", placeholder: "List out-of-scope assets..." },
        { key: "roe", label: "Rules of Engagement", placeholder: "Specific rules, constraints, or authorized actions..." },
    ] as const

    // State for currently focused field index
    const [focusIdx, setFocusIdx] = createSignal(0)
    // Loading state for save operation
    const [isSaving, setIsSaving] = createSignal(false)
    // AI Auto-Fill state
    const [view, setView] = createSignal<"form" | "confirm">("form")
    const [isAiLoading, setIsAiLoading] = createSignal(false)

    // Form and Settings State
    const [draftValues, setDraftValues] = createSignal<Record<string, string>>(props.initialState?.draftValues || {})
    const [isSettingsOpen, setIsSettingsOpen] = createSignal(props.initialState?.isSettingsOpen || false)
    const [aiSettings, setAiSettings] = createSignal(props.initialState?.aiSettings || {})

    const [defaultPrompt, setDefaultPrompt] = createSignal("")
    const [isPromptReady, setIsPromptReady] = createSignal(false)

    // Fetch default prompt
    createEffect(async () => {
        try {
            const url = new URL("session/engagement/config", sdk.url).toString()
            const fetchFn = sdk.fetch || fetch
            const res = await fetchFn(url)
            if (res.ok) {
                const json = await res.json()
                setDefaultPrompt(json.prompt)
            }
        } catch (e) {
            console.error("Failed to fetch default prompt", e)
        } finally {
            setIsPromptReady(true)
        }
    })

    // Refs for textareas to manage focus
    const textareaRefs: (TextareaRenderable | undefined)[] = []
    let promptRef: TextareaRenderable | undefined

    // Get session data
    const session = createMemo(() => props.sessionID ? sync.session.get(props.sessionID) : undefined)
    const engagement = createMemo(() => (session() as any)?.engagement || {})

    // Update prompt ref when defaultPrompt loads if empty
    createEffect(() => {
        const def = defaultPrompt()
        const current = aiSettings().prompt ?? (session() as any)?.engagement?.aiSettings?.prompt
        if (def && !current && promptRef) {
            // We can't easily update the textarea content if it's uncontrolled without a re-render or internal method.
            // But we can try to rely on the key if we used one, or just set it via ref if available.
            // For now, let's just let it be. The initialValue might have been empty.
        }
    })

    // Focus management
    createEffect(() => {
        if (view() !== "form") return
        const idx = focusIdx()
        // Small timeout to ensure DOM is ready
        setTimeout(() => {
            const ref = textareaRefs[idx]
            if (ref && !ref.isDestroyed) {
                ref.focus()
            }
        }, 10)
    })

    const captureValues = () => {
        const collected: Record<string, string> = {}
        fields.forEach((field, idx) => {
            const ref = textareaRefs[idx]
            // Ensure we capture a value (empty string) even if ref is missing locally or text is empty
            // This prevents falling back to session/persisted values when restoring state
            collected[field.key] = ref?.plainText?.trim() || ""
        })
        return collected
    }

    const captureAllState = () => {
        const draft = captureValues()
        const prompt = promptRef?.plainText.trim()

        let currentSettings = aiSettings()
        if (prompt !== undefined) {
            currentSettings = { ...currentSettings, prompt }
        }

        return {
            draftValues: draft,
            aiSettings: currentSettings,
            isSettingsOpen: isSettingsOpen()
        }
    }

    const handleAutoFillRequest = () => {
        const current = captureValues()
        setDraftValues(current)
        setView("confirm")
    }

    const handleConfirmAutoFill = async () => {
        setIsAiLoading(true)
        try {
            // 1. Prepare payload
            const state = captureAllState()
            setDraftValues(state.draftValues)
            const settings = state.aiSettings

            const currentModel = (settings.modelID && settings.providerID)
                ? { providerID: settings.providerID, modelID: settings.modelID }
                : local.model.current()

            // 2. Call Server with mandatory delay (3s min)
            const url = new URL('session/engagement/generate', sdk.url).toString()
            const fetchFn = sdk.fetch || fetch
            const fetchPromise = fetchFn(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    current: state.draftValues,
                    model: currentModel ? {
                        providerID: currentModel.providerID,
                        modelID: currentModel.modelID
                    } : undefined,
                    prompt: settings.prompt
                })
            })

            const delayPromise = new Promise(resolve => setTimeout(resolve, 3000))

            const [res] = await Promise.all([fetchPromise, delayPromise])

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`)
            }

            // 3. Update Form
            const json = await res.json()
            setDraftValues(prev => ({
                ...prev,
                name: json.name || prev.name,
                scope: json.scope || prev.scope,
                targets: json.targets || prev.targets,
                exclusions: json.exclusions || prev.exclusions,
                roe: json.roe || prev.roe,
            }))

            toast.show({ message: "Auto-filled success!", variant: "success" })
        } catch (e) {
            console.error("AI Auto-Fill failed", e)
            toast.show({ variant: "error", message: `AI Auto-Fill failed: ${e instanceof Error ? e.message : String(e)}` })
        } finally {
            setIsAiLoading(false)
            setView("form")
        }
    }

    const handleSave = async () => {
        if (isSaving()) return
        setIsSaving(true)

        // Collect values from state
        const state = captureAllState()
        const collectedValues = state.draftValues
        const settings = state.aiSettings

        try {
            // 1. Create session if needed
            let sessionID = props.sessionID
            if (!sessionID) {
                const session = await sdk.client.session.create({})
                sessionID = session.data!.id
            }

            // 2. Save engagement data
            const url = new URL(`session/${sessionID}/engagement`, sdk.url).toString()
            const fetchFn = sdk.fetch || fetch
            const res = await fetchFn(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...collectedValues,
                    aiSettings: settings
                })
            })

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`)
            }

            // 3. Construct message
            const message = `Here is my engagement briefing:

Name: ${collectedValues.name || "N/A"}
Scope: ${collectedValues.scope || "N/A"}
In-Scope Targets: ${collectedValues.targets || "N/A"}
Exclusions: ${collectedValues.exclusions || "N/A"}
Rules of Engagement: ${collectedValues.roe || "N/A"}

Acknowledge this engagement context.`

            // 4. Send message to LLM
            const selectedModel = (settings.modelID && settings.providerID)
                ? { providerID: settings.providerID, modelID: settings.modelID }
                : local.model.current()

            if (selectedModel) {
                await sdk.client.session.prompt({
                    sessionID,
                    ...selectedModel,
                    messageID: Identifier.ascending("message"),
                    agent: local.agent.current().name,
                    model: selectedModel,
                    variant: local.model.variant.current(),
                    parts: [{
                        id: Identifier.ascending("part"),
                        type: "text",
                        text: message
                    }]
                })
            } else {
                toast.show({ variant: "warning", message: "Engagement saved, but connect a provider to send briefing." })
            }

            // 5. Navigate to session
            route.navigate({ type: "session", sessionID })

            toast.show({ message: "Engagement saved", variant: "success" })
            dialog.clear()
        } catch (error) {
            toast.show({ message: "Failed to save engagement", variant: "error" })
            console.error(error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleCancel = () => {
        toast.show({ message: "Engagement cancelled", variant: "info" })
        dialog.clear()
    }

    // Keyboard navigation
    useKeyboard((evt) => {
        if (evt.name === "tab") {
            // Cycle focus
            if (evt.shift) {
                setFocusIdx(prev => (prev - 1 + fields.length) % fields.length)
            } else {
                setFocusIdx(prev => (prev + 1) % fields.length)
            }
        } else if (evt.ctrl && evt.name === "s") {
            handleSave()
        }
    })

    return (
        <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1} flexDirection="column">
            {/* Header */}
            <box flexDirection="row" justifyContent="space-between">
                <text attributes={TextAttributes.BOLD} fg={theme.text}>
                    Create Engagement
                </text>
                <text fg={theme.textMuted}>esc</text>
            </box>

            {/* Fields */}
            <scrollbox maxHeight={20}>
                <Show when={view() === "form"} fallback={
                    <box flexDirection="column" gap={1} padding={2} alignItems="center">
                        <text attributes={TextAttributes.BOLD} fg={theme.text}>
                            Generate engagement with AI?
                        </text>
                        <text fg={theme.textMuted}>
                            This will use your current input to generate comprehensive details.
                            Existing fields may be overwritten.
                        </text>
                        <Show when={isAiLoading()}>
                            <text fg={theme.primary}>Generating...</text>
                        </Show>
                        <Show when={!isAiLoading()}>
                            <box flexDirection="row" gap={2} paddingTop={1}>
                                <text fg={theme.primary} onMouseUp={handleConfirmAutoFill}>
                                    [Confirm]
                                </text>
                                <text fg={theme.textMuted} onMouseUp={() => setView("form")}>
                                    [Cancel]
                                </text>
                            </box>
                        </Show>
                    </box>
                }>
                    <box flexDirection="column" gap={1}>
                        <Show when={props.sessionID ? session() : true} fallback={<text fg={theme.textMuted}>Loading session...</text>}>
                            <For each={fields}>
                                {(field, idx) => (
                                    <box flexDirection="column">
                                        <text fg={focusIdx() === idx() ? theme.primary : theme.textMuted}>
                                            {field.label}
                                        </text>
                                        <textarea
                                            height={3}
                                            placeholder={field.placeholder}
                                            initialValue={draftValues()[field.key] ?? engagement()[field.key] ?? ""}
                                            ref={(val: TextareaRenderable) => { textareaRefs[idx()] = val }}
                                            textColor={theme.text}
                                            focusedTextColor={theme.text}
                                            cursorColor={theme.text}
                                            onSubmit={() => {
                                                // Optional: enter moves to next field if we decide to implement that.
                                            }}
                                        />
                                    </box>
                                )}
                            </For>
                        </Show>
                    </box>
                </Show>

                {/* AI Settings */}
                <box flexDirection="column">
                    <box paddingBottom={1} paddingTop={1}>
                        <text
                            fg={theme.textMuted}
                            onMouseUp={() => setIsSettingsOpen(!isSettingsOpen())}
                        >
                            {isSettingsOpen() ? "▼ Hide AI Settings" : "▶ Show AI Settings"}
                        </text>
                    </box>

                    <Show when={isSettingsOpen()}>
                        <box flexDirection="column" gap={1} paddingBottom={1} borderStyle="rounded" borderColor={theme.border} padding={1}>
                            <box flexDirection="row" gap={2} alignItems="center">
                                <text fg={theme.textMuted}>Model:</text>
                                <text fg={theme.primary}>
                                    {aiSettings().modelID
                                        ? `${aiSettings().providerID}/${aiSettings().modelID}`
                                        : `${local.model.current()?.providerID}/${local.model.current()?.modelID} (Default)`
                                    }
                                </text>
                                <text
                                    fg={theme.textMuted}
                                    onMouseUp={() => {
                                        const currentState = captureAllState()

                                        dialog.replace(() => <DialogModel onSelect={(m) => {
                                            dialog.replace(() => <DialogEngagement
                                                sessionID={props.sessionID}
                                                initialState={{
                                                    ...currentState,
                                                    aiSettings: {
                                                        ...currentState.aiSettings,
                                                        ...m
                                                    }
                                                }}
                                            />)
                                        }} />)
                                    }}
                                >
                                    [Change]
                                </text>
                                <Show when={aiSettings().modelID}>
                                    <text
                                        fg={theme.textMuted}
                                        onMouseUp={() => setAiSettings(prev => ({ ...prev, modelID: undefined, providerID: undefined }))}
                                    >
                                        [Reset]
                                    </text>
                                </Show>
                            </box>
                            <box flexDirection="column">
                                <box flexDirection="row" justifyContent="space-between">
                                    <text fg={theme.textMuted}>Custom Prompt:</text>
                                    <Show when={aiSettings().prompt !== undefined && aiSettings().prompt !== defaultPrompt()}>
                                        <text
                                            fg={theme.primary}
                                            onMouseUp={() => {
                                                setAiSettings(prev => ({ ...prev, prompt: undefined }))
                                                setIsPromptReady(false)
                                                setTimeout(() => setIsPromptReady(true), 10)
                                            }}
                                        >
                                            [Reset to Default]
                                        </text>
                                    </Show>
                                </box>
                                <box flexDirection="row" gap={1} alignItems="center">
                                    <text fg={theme.textMuted}>
                                        {(() => {
                                            const p = aiSettings().prompt ?? (session() as any)?.engagement?.aiSettings?.prompt
                                            if (p && p !== defaultPrompt()) return `Custom (${p.length} chars)`
                                            if (defaultPrompt()) return `Default (${defaultPrompt().length} chars)`
                                            return "Default (Loading...)"
                                        })()}
                                    </text>
                                    <text
                                        fg={theme.primary}
                                        onMouseUp={() => {
                                            const currentState = captureAllState()
                                            const currentPrompt = aiSettings().prompt ?? (session() as any)?.engagement?.aiSettings?.prompt ?? defaultPrompt()

                                            dialog.replace(() => <DialogTextEdit
                                                title="Edit Engagement Prompt"
                                                initialText={currentPrompt}
                                                placeholder="Enter custom prompt instructions..."
                                                onSave={(newText) => {
                                                    dialog.replace(() => <DialogEngagement
                                                        sessionID={props.sessionID}
                                                        initialState={{
                                                            ...currentState,
                                                            aiSettings: {
                                                                ...currentState.aiSettings,
                                                                prompt: newText
                                                            },
                                                            isSettingsOpen: true
                                                        }}
                                                    />)
                                                }}
                                                onCancel={() => {
                                                    dialog.replace(() => <DialogEngagement
                                                        sessionID={props.sessionID}
                                                        initialState={{
                                                            ...currentState,
                                                            isSettingsOpen: true
                                                        }}
                                                    />)
                                                }}
                                            />)
                                        }}
                                    >
                                        [Edit]
                                    </text>
                                </box>
                            </box>
                        </box>
                    </Show>
                </box>
            </scrollbox>


            {/* Footer / Actions */}
            <box flexDirection="row" gap={2} paddingTop={1} justifyContent="space-between">
                <Show when={view() === "form"}>
                    <box flexDirection="row" gap={2}>
                        <text fg={theme.success} onMouseUp={handleSave}>
                            {isSaving() ? "[Saving...]" : "[Save] (Ctrl+S)"}
                        </text>
                        <text fg={theme.textMuted} onMouseUp={handleCancel}>
                            [Cancel] (Esc)
                        </text>
                    </box>
                    <text fg={theme.warning} onMouseUp={handleAutoFillRequest}>
                        [✨ Fill with AI]
                    </text>
                </Show>
            </box>
        </box>
    )
}
