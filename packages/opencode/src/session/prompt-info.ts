import { Provider } from "@/provider/provider"
import { Agent } from "@/agent/agent"
import { SystemPrompt } from "./system"
import { InstructionPrompt } from "./instruction"

/**
 * Aggregates all prompt sources for a session to display in /prompts dialog
 */
export namespace PromptInfo {
    export type Entry = {
        name: string
        source: string
        type: "system" | "instruction" | "agent" | "environment"
        content: string
        model?: string
    }

    /**
     * Get all prompts that would be sent for a given model and agent
     */
    export async function getAll(model: Provider.Model, agent: Agent.Info): Promise<Entry[]> {
        const entries: Entry[] = []

        // 1. System prompt based on model
        const systemPrompts = SystemPrompt.provider(model)
        if (systemPrompts.length > 0) {
            entries.push({
                name: "Main System Prompt",
                source: getSystemPromptSource(model),
                type: "system",
                content: systemPrompts.join("\n\n"),
                model: model.api.id,
            })
        }

        // 2. Environment context (dynamic)
        try {
            const envPrompts = await SystemPrompt.environment(model)
            if (envPrompts.length > 0) {
                entries.push({
                    name: "Environment Context",
                    source: "(generated at runtime)",
                    type: "environment",
                    content: envPrompts.join("\n\n"),
                })
            }
        } catch {
            // Ignore errors fetching environment
        }

        // 3. Instruction files (AGENTS.md etc)
        try {
            const instructionPaths = await InstructionPrompt.systemPaths()
            const instructions = await InstructionPrompt.system()

            let idx = 0
            for (const filepath of instructionPaths) {
                entries.push({
                    name: `Instruction File ${idx + 1}`,
                    source: filepath,
                    type: "instruction",
                    content: instructions[idx] || "(loading...)",
                })
                idx++
            }
        } catch {
            // Ignore errors fetching instructions
        }

        // 4. Agent-specific prompt (if set)
        if (agent.prompt) {
            entries.push({
                name: `Agent: ${agent.name}`,
                source: getAgentPromptSource(agent.name),
                type: "agent",
                content: agent.prompt,
            })
        }

        return entries
    }

    /**
     * Determine source file for system prompt based on model
     */
    function getSystemPromptSource(model: Provider.Model): string {
        const id = model.api.id
        if (id.includes("gpt-5")) return "src/session/prompt/codex_header.txt"
        if (id.includes("gpt-") || id.includes("o1") || id.includes("o3")) return "src/session/prompt/beast.txt"
        if (id.includes("gemini-")) return "src/session/prompt/gemini.txt"
        if (id.includes("claude")) return "src/session/prompt/anthropic.txt"
        return "src/session/prompt/qwen.txt"
    }

    /**
     * Determine source file for agent prompt
     */
    function getAgentPromptSource(agentName: string): string {
        const knownAgents: Record<string, string> = {
            title: "src/agent/prompt/title.txt",
            summary: "src/agent/prompt/summary.txt",
            compaction: "src/agent/prompt/compaction.txt",
            explore: "src/agent/prompt/explore.txt",
        }
        return knownAgents[agentName] || "(custom agent prompt)"
    }
}
