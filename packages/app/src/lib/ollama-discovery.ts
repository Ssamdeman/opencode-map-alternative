export interface OllamaModelResponse {
    models: {
        name: string
        model: string
        modified_at: string
        size: number
        digest: string
        details: {
            parent_model: string
            format: string
            family: string
            families: string[]
            parameter_size: string
            quantization_level: string
        }
    }[]
}

export type LocalModelInfo = {
    id: string
    name: string
    family: string
    release_date: string
    attachment: boolean
    reasoning: boolean
    temperature: boolean
    tool_call: boolean
    limit: {
        context: number
        output: number
    }
}

export async function detectOllama(): Promise<boolean> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000)

        // Simple check to see if Ollama is responsive
        console.log("[Ollama] Probing http://localhost:11434/ ...")
        const res = await fetch("http://localhost:11434/", {
            method: "HEAD",
            mode: "no-cors",
            signal: controller.signal
        })

        clearTimeout(timeoutId)
        console.log("[Ollama] Probe result (opaque):", res.type)
        return true // If we get here, the server accepted the connection
    } catch (e) {
        console.error("[Ollama] Probe failed:", e)
        return false
    }
}

export async function fetchOllamaModels(): Promise<LocalModelInfo[]> {
    try {
        console.log("[Ollama] Fetching models from /api/tags ...")
        const res = await fetch("http://localhost:11434/api/tags")
        if (!res.ok) {
            console.warn("[Ollama] Failed to fetch tags:", res.status)
            return []
        }
        const data = (await res.json()) as OllamaModelResponse
        console.log("[Ollama] Fetched models:", data.models)

        return data.models.map(m => ({
            id: m.name,
            name: m.name,
            family: m.details.family || "ollama",
            release_date: m.modified_at,
            attachment: false, // Ollama doesn't typically support attachments in standard way yet
            reasoning: false,
            temperature: true,
            tool_call: false, // Assume false for now unless we sniff version/capabilities
            limit: {
                context: 4096, // Default safety assumption
                output: 4096
            }
        }))
    } catch (e) {
        console.warn("Failed to fetch Ollama models", e)
        return []
    }
}
