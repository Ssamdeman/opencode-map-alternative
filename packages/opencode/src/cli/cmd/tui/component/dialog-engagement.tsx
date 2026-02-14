import { TextAttributes, type TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { createSignal, createEffect, For, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"

export function DialogEngagement() {
    const { theme } = useTheme()
    const dialog = useDialog()
    const toast = useToast()

    // Field definitions
    const fields = [
        { key: "name", label: "Engagement Name", placeholder: "e.g. Red Team Assessment 2024" },
        { key: "scope", label: "Scope", placeholder: "Define the boundaries..." },
        { key: "targets", label: "Targets", placeholder: "List IP ranges, domains, or assets..." },
        { key: "exclusions", label: "Exclusions", placeholder: "List out-of-scope assets..." },
        { key: "roe", label: "Rules of Engagement", placeholder: "Specific rules, constraints, orauthorized actions..." },
    ] as const

    // State for currently focused field index
    const [focusIdx, setFocusIdx] = createSignal(0)

    // Refs for textareas to manage focus
    const textareaRefs: (TextareaRenderable | undefined)[] = []

    // Focus management
    createEffect(() => {
        const idx = focusIdx()
        // Small timeout to ensure DOM is ready
        setTimeout(() => {
            const ref = textareaRefs[idx]
            if (ref && !ref.isDestroyed) {
                ref.focus()
            }
        }, 10)
    })

    const handleSave = () => {
        // Collect values from refs
        const collectedValues: Record<string, string> = {}
        fields.forEach((field, idx) => {
            const ref = textareaRefs[idx]
            if (ref) {
                collectedValues[field.key] = ref.plainText.trim()
            }
        })

        // Phase 1: Just show a toast
        toast.show({ message: "Engagement saved", variant: "success" })
        dialog.clear()
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
                <box flexDirection="column" gap={1}>
                    <For each={fields}>
                        {(field, idx) => (
                            <box flexDirection="column">
                                <text fg={focusIdx() === idx() ? theme.primary : theme.textMuted}>
                                    {field.label}
                                </text>
                                <textarea
                                    height={3}
                                    placeholder={field.placeholder}
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
                </box>
            </scrollbox>

            {/* Footer / Actions */}
            <box flexDirection="row" gap={2} paddingTop={1}>
                <text fg={theme.success} onMouseUp={handleSave}>
                    [Save] (Ctrl+S)
                </text>
                <text fg={theme.textMuted} onMouseUp={handleCancel}>
                    [Cancel] (Esc)
                </text>
            </box>
        </box>
    )
}
