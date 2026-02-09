import path from "path"
import { Global } from "../global"
import { Log } from "../util/log"
import { ulid } from "ulid"
import fs from "fs/promises"

/**
 * Transparent Data Flow Logger
 * 
 * Captures and stores raw I/O data for AI communication.
 * Data is tied to session lifecycle and deleted when session is removed.
 */
export namespace Transparent {
    const log = Log.create({ service: "transparent" })

    /**
     * Schema for a single transparent log entry
     */
    export type Entry = {
        id: string
        correlationId?: string  // Links request with corresponding response
        timestamp: number
        type: "request" | "response"
        data: RequestData | ResponseData
    }

    export type RequestData = {
        agent: string
        model: {
            providerID: string
            modelID: string
        }
        system: string[]
        messages: unknown[]
        tools: string[]
        options: Record<string, unknown>
    }

    export type ResponseData = {
        agent: string
        text: string
        usage?: {
            promptTokens?: number
            completionTokens?: number
            totalTokens?: number
        }
        toolCalls?: Array<{
            name: string
            args: unknown
        }>
        finishReason?: string
    }

    /**
     * Get the file path for a session's transparent log
     */
    function getPath(sessionID: string): string {
        return path.join(Global.Path.data, "transparent", `${sessionID}.json`)
    }

    /**
     * Log a request entry for a session
     * Returns a correlation ID to link with the response
     */
    export async function logRequest(sessionID: string, data: RequestData): Promise<string> {
        const correlationId = ulid()
        const entry: Entry = {
            id: ulid(),
            correlationId,
            timestamp: Date.now(),
            type: "request",
            data,
        }

        try {
            const filepath = getPath(sessionID)
            const dir = path.dirname(filepath)
            await fs.mkdir(dir, { recursive: true })

            // Read existing entries or start fresh
            let entries: Entry[] = []
            try {
                const existing = await Bun.file(filepath).json()
                if (Array.isArray(existing)) {
                    entries = existing
                }
            } catch {
                // File doesn't exist yet, start with empty array
            }

            entries.push(entry)
            await Bun.write(filepath, JSON.stringify(entries, null, 2))
            log.info("logged request", { sessionID, correlationId })
        } catch (e) {
            log.error("failed to log request", { sessionID, error: e })
        }

        return correlationId
    }

    /**
     * Log a response entry for a session, linked to a request
     */
    export async function logResponse(sessionID: string, correlationId: string, data: ResponseData): Promise<void> {
        const entry: Entry = {
            id: ulid(),
            correlationId,
            timestamp: Date.now(),
            type: "response",
            data,
        }

        try {
            const filepath = getPath(sessionID)
            const dir = path.dirname(filepath)
            await fs.mkdir(dir, { recursive: true })

            // Read existing entries or start fresh
            let entries: Entry[] = []
            try {
                const existing = await Bun.file(filepath).json()
                if (Array.isArray(existing)) {
                    entries = existing
                }
            } catch {
                // File doesn't exist yet, start with empty array
            }

            entries.push(entry)
            await Bun.write(filepath, JSON.stringify(entries, null, 2))
            log.info("logged response", { sessionID, correlationId })
        } catch (e) {
            log.error("failed to log response", { sessionID, error: e })
        }
    }

    /**
     * Legacy function - use logRequest/logResponse instead
     * @deprecated
     */
    export async function logEntry(sessionID: string, type: "request" | "response", data: RequestData | ResponseData): Promise<void> {
        const entry: Entry = {
            id: ulid(),
            timestamp: Date.now(),
            type,
            data,
        }

        try {
            const filepath = getPath(sessionID)
            const dir = path.dirname(filepath)
            await fs.mkdir(dir, { recursive: true })

            // Read existing entries or start fresh
            let entries: Entry[] = []
            try {
                const existing = await Bun.file(filepath).json()
                if (Array.isArray(existing)) {
                    entries = existing
                }
            } catch {
                // File doesn't exist yet, start with empty array
            }

            entries.push(entry)
            await Bun.write(filepath, JSON.stringify(entries, null, 2))
            log.info("logged entry", { sessionID, type, entryID: entry.id })
        } catch (e) {
            log.error("failed to log entry", { sessionID, type, error: e })
        }
    }

    /**
     * Get all entries for a session
     */
    export async function get(sessionID: string): Promise<Entry[]> {
        try {
            const filepath = getPath(sessionID)
            const entries = await Bun.file(filepath).json()
            if (Array.isArray(entries)) {
                return entries as Entry[]
            }
            return []
        } catch {
            return []
        }
    }

    /**
     * Clear all transparent data for a session
     */
    export async function clear(sessionID: string): Promise<void> {
        try {
            const filepath = getPath(sessionID)
            await fs.unlink(filepath)
            log.info("cleared transparent log", { sessionID })
        } catch {
            // File may not exist, that's fine
        }
    }

    /**
     * Check if a session has any transparent log data
     */
    export async function exists(sessionID: string): Promise<boolean> {
        try {
            const filepath = getPath(sessionID)
            await fs.access(filepath)
            return true
        } catch {
            return false
        }
    }
}
