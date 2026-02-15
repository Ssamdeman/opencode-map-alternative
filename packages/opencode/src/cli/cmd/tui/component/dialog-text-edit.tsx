import { TextAttributes, type TextareaRenderable } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { createSignal, onMount } from "solid-js"
import { useKeyboard } from "@opentui/solid"

export function DialogTextEdit(props: {
    initialText: string
    title?: string
    placeholder?: string
    onSave: (text: string) => void
    onCancel?: () => void
}) {
    const { theme } = useTheme()
    const dialog = useDialog()
    const [text, setText] = createSignal(props.initialText)
    let textareaRef: TextareaRenderable | undefined

    onMount(() => {
        // Focus the textarea immediately
        setTimeout(() => {
            if (textareaRef && !textareaRef.isDestroyed) {
                textareaRef.focus()
                // Ideally move cursor to end, but TextareaRenderable API might vary
            }
        }, 10)
    })

    const handleSave = () => {
        const currentText = textareaRef?.plainText ?? text()
        props.onSave(currentText)
        dialog.clear() // Or let parent handle it? Usually dialog components handle their own closing or return
    }

    const handleCancel = () => {
        if (props.onCancel) props.onCancel()
        dialog.clear() // Assuming this component replaces the current view, clearing might traverse back?
        // Actually getting back to previous dialog usually requires the parent to re-mount it.
        // In this architecture, dialog.replace() was used.
        // So we likely just call onCancel/onSave and let the caller restore the previous dialog.
    }

    useKeyboard((evt) => {
        if (evt.name === "escape") {
            handleCancel()
        } else if (evt.ctrl && evt.name === "s") {
            handleSave()
        }
    })

    return (
        <box flexDirection="column" padding={1} gap={1}>
            <box flexDirection="row" justifyContent="space-between" paddingBottom={1}>
                <text attributes={TextAttributes.BOLD} fg={theme.text}>
                    {props.title || "Edit Text"}
                </text>
                <text fg={theme.textMuted}>
                    Esc to Cancel
                </text>
            </box>

            <textarea
                height={20} // Make it tall
                placeholder={props.placeholder}
                initialValue={text()}
                ref={(val) => textareaRef = val}
                textColor={theme.text}
                focusedTextColor={theme.text}
                cursorColor={theme.primary}
            />

            <box flexDirection="row" gap={2} paddingTop={1}>
                <text fg={theme.success} onMouseUp={handleSave}>
                    [Save] (Ctrl+S)
                </text>
                <text fg={theme.textMuted} onMouseUp={handleCancel}>
                    [Cancel]
                </text>
            </box>
        </box>
    )
}
