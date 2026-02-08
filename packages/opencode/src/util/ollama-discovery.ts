
export interface LocalModelInfo {
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
    cost?: {
        input: number
        output: number
    }
}

type OllamaModelResponse = {
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

export async function detectOllama(): Promise<boolean> {
    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000)

        // Simple check to see if Ollama is responsive
        // Using no-cors mode to align with app behavior, though server-side fetch (if used) ignores CORS
        // But here we are likely in Bun environment which doesn't enforce CORS the same way, or this is TUI code running in Bun.
        const res = await fetch("http://localhost:11434/", {
            method: "HEAD",
            signal: controller.signal
        })

        clearTimeout(timeoutId)
        return res.ok || res.status === 404
    } catch (e) {
        return false
    }
}

export async function fetchOllamaModels(): Promise<LocalModelInfo[]> {
    try {
        const res = await fetch("http://localhost:11434/api/tags")
        if (!res.ok) return []
        const data = (await res.json()) as OllamaModelResponse

        return data.models.map(m => ({
            id: m.name,
            name: m.name,
            family: m.details.family || "ollama",
            release_date: m.modified_at,
            attachment: false,
            reasoning: false,
            temperature: true,
            tool_call: false,
            limit: {
                context: 4096,
                output: 4096
            },
            cost: {
                input: 0,
                output: 0
            }
        }))
    } catch (e) {
        return []
    }
}
