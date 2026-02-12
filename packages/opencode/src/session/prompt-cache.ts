/**
 * Session-scoped prompt override cache
 * 
 * Stores user-edited prompts for the current session only.
 * Automatically cleaned up when session is deleted.
 */

const TTL_MS = 1000 * 60 * 60 * 4 // 4 hours
const MAX_ENTRIES = 100

/**
 * Prompt key types that can be overridden:
 * - system:{model} - Model-specific system prompt (e.g., system:anthropic, system:beast)
 * - instruction:{path} - Instruction file (e.g., instruction:AGENTS.md)
 * - agent:{name} - Agent-specific prompt (e.g., agent:title, agent:summary)
 * - environment - Runtime environment context
 */
export type PromptKey =
    | `system:${string}`
    | `instruction:${string}`
    | `agent:${string}`
    | "environment"

export type CacheEntry = {
    content: string
    timestamp: number
}

// In-memory storage: Map<sessionID, Map<PromptKey, CacheEntry>>
const cache = new Map<string, Map<PromptKey, CacheEntry>>()
const INSTANCE_ID = Math.random().toString(36).slice(2, 8)


export namespace SessionPromptCache {
    /**
     * Set an override for a specific prompt in a session
     */
    export function set(sessionID: string, key: PromptKey, content: string): void {

        let sessionCache = cache.get(sessionID)
        if (!sessionCache) {
            sessionCache = new Map()
            cache.set(sessionID, sessionCache)
        }

        // Enforce max entries per session
        if (sessionCache.size >= MAX_ENTRIES && !sessionCache.has(key)) {
            // Remove oldest entry
            let oldestKey: PromptKey | null = null
            let oldestTime = Infinity
            for (const [k, v] of sessionCache.entries()) {
                if (v.timestamp < oldestTime) {
                    oldestTime = v.timestamp
                    oldestKey = k
                }
            }
            if (oldestKey) sessionCache.delete(oldestKey)
        }

        sessionCache.set(key, {
            content,
            timestamp: Date.now(),
        })

        // Clean up expired entries across all sessions
        cleanupExpired()
    }

    /**
     * Get an override for a specific prompt (returns undefined if not set or expired)
     */
    export function get(sessionID: string, key: PromptKey): string | undefined {

        const sessionCache = cache.get(sessionID)
        if (!sessionCache) return undefined

        const entry = sessionCache.get(key)
        if (!entry) return undefined

        // Check TTL
        if (Date.now() - entry.timestamp > TTL_MS) {
            sessionCache.delete(key)
            return undefined
        }

        return entry.content
    }

    /**
     * Check if a specific prompt has an override
     */
    export function has(sessionID: string, key: PromptKey): boolean {
        return get(sessionID, key) !== undefined
    }

    /**
     * Remove a specific override
     */
    export function remove(sessionID: string, key: PromptKey): void {
        const sessionCache = cache.get(sessionID)
        if (sessionCache) {
            sessionCache.delete(key)
            if (sessionCache.size === 0) {
                cache.delete(sessionID)
            }
        }
    }

    /**
     * Clear all overrides for a session (called on session delete)
     */
    export function clear(sessionID: string): void {
        cache.delete(sessionID)
    }

    /**
     * Get all overrides for a session (for display in /prompts dialog)
     */
    export function getAll(sessionID: string): Map<PromptKey, CacheEntry> {
        const sessionCache = cache.get(sessionID)
        if (!sessionCache) return new Map()

        // Return only non-expired entries
        const result = new Map<PromptKey, CacheEntry>()
        const now = Date.now()
        for (const [key, entry] of sessionCache.entries()) {
            if (now - entry.timestamp <= TTL_MS) {
                result.set(key, entry)
            }
        }
        return result
    }

    /**
     * Get list of all keys with overrides for a session
     */
    export function keys(sessionID: string): PromptKey[] {
        return Array.from(getAll(sessionID).keys())
    }

    /**
     * Clean up expired entries across all sessions
     */
    function cleanupExpired(): void {
        const now = Date.now()
        for (const [sessionID, sessionCache] of cache.entries()) {
            for (const [key, entry] of sessionCache.entries()) {
                if (now - entry.timestamp > TTL_MS) {
                    sessionCache.delete(key)
                }
            }
            if (sessionCache.size === 0) {
                cache.delete(sessionID)
            }
        }
    }

    /**
     * Get count of active overrides (for debugging/status)
     */
    export function stats(): { sessions: number; entries: number } {
        let entries = 0
        for (const sessionCache of cache.values()) {
            entries += sessionCache.size
        }
        return { sessions: cache.size, entries }
    }
}
