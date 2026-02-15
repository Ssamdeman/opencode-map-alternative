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

export function DialogEngagement(props: { sessionID?: string }) {
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
    const [draftValues, setDraftValues] = createSignal<Record<string, string>>({})

    // Refs for textareas to manage focus
    const textareaRefs: (TextareaRenderable | undefined)[] = []

    // Get session data
    const session = createMemo(() => props.sessionID ? sync.session.get(props.sessionID) : undefined)
    const engagement = createMemo(() => (session() as any)?.engagement || {})

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
            if (ref) {
                collected[field.key] = ref.plainText.trim()
            }
        })
        return collected
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
            const current = draftValues()
            const currentModel = local.model.current()

            // 2. Call Server with mandatory delay (3s min)
            const url = new URL('session/engagement/generate', sdk.url).toString()
            const fetchFn = sdk.fetch || fetch
            const fetchPromise = fetchFn(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    current,
                    model: currentModel ? {
                        providerID: currentModel.providerID,
                        modelID: currentModel.modelID
                    } : undefined
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

        // Collect values from refs
        const collectedValues: Record<string, string> = {}
        fields.forEach((field, idx) => {
            const ref = textareaRefs[idx]
            if (ref) {
                collectedValues[field.key] = ref.plainText.trim()
            }
        })

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
                body: JSON.stringify(collectedValues)
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
            const selectedModel = local.model.current()
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
