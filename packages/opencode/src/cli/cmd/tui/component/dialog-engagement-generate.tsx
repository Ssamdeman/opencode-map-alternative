import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useToast } from "../ui/toast"
import { createSignal } from "solid-js"
import { useSDK } from "../context/sdk"
import { useLocal } from "../context/local"

export function DialogEngagementGenerate(props: {
    currentValues: Record<string, string>
    aiSettings: {
        providerID?: string
        modelID?: string
        prompt?: string
    }
    onSuccess: (newValues: Record<string, string>) => void
    onCancel: () => void
}) {
    const { theme } = useTheme()
    const sdk = useSDK()
    const local = useLocal()
    const toast = useToast()
    const [isLoading, setIsLoading] = createSignal(false)

    const handleConfirm = async () => {
        setIsLoading(true)
        try {
            // 1. Prepare settings
            const settings = props.aiSettings
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
                    current: props.currentValues,
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

            // 3. Process Result
            const json = await res.json()
            const merged = {
                ...props.currentValues,
                name: json.name || props.currentValues.name,
                scope: json.scope || props.currentValues.scope,
                targets: json.targets || props.currentValues.targets,
                exclusions: json.exclusions || props.currentValues.exclusions,
                roe: json.roe || props.currentValues.roe,
            }

            toast.show({ message: "Auto-filled success!", variant: "success" })
            props.onSuccess(merged)

        } catch (e) {
            console.error("AI Auto-Fill failed", e)
            toast.show({ variant: "error", message: `AI Auto-Fill failed: ${e instanceof Error ? e.message : String(e)}` })
            // On error, stay in dialog or cancel?
            // Usually stay so they can try again or cancel.
            setIsLoading(false)
        }
    }

    return (
        <box flexDirection="column" gap={1} padding={2} alignItems="center">
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
                Generate engagement with AI?
            </text>
            <text fg={theme.textMuted}>
                This will use your current input to generate comprehensive details.
                Existing fields may be overwritten.
            </text>
            {isLoading() ? (
                <text fg={theme.primary}>Generating...</text>
            ) : (
                <box flexDirection="row" gap={2} paddingTop={1}>
                    <text fg={theme.primary} onMouseUp={handleConfirm}>
                        [Confirm]
                    </text>
                    <text fg={theme.textMuted} onMouseUp={props.onCancel}>
                        [Cancel]
                    </text>
                </box>
            )}
        </box>
    )
}
