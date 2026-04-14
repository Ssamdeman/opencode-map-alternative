import path from "path"
import { Session } from "@/session"
import { Instance } from "@/project/instance"

// In-memory state keyed by parent sessionID
const state = new Map<string, EngagementBench>()
// Child sessionID -> parent sessionID cache
const parentCache = new Map<string, string>()

interface AgentStats {
  bashCommands: number
  firstCommand?: string
  lastCommand?: string
}

interface Dispatch {
  agent: string
  startTime: string
  endTime?: string
  status: "completed" | "error" | "in-progress"
}

interface EngagementBench {
  engagementStart: string
  engagementEnd?: string
  agents: Record<string, AgentStats>
  dispatches: Dispatch[]
}

function sharedDir() {
  return path.join(Instance.worktree, ".opencode", "shared-resources")
}

function benchPath() {
  return path.join(sharedDir(), "benchmark-log.json")
}

function ensure(parentSessionID: string) {
  if (!state.has(parentSessionID)) {
    state.set(parentSessionID, {
      engagementStart: new Date().toISOString(),
      agents: {},
      dispatches: [],
    })
  }
  return state.get(parentSessionID)!
}

async function flush(parentSessionID: string) {
  const bench = state.get(parentSessionID)
  if (!bench) return
  try {
    const file = Bun.file(benchPath())
    await Bun.write(file, JSON.stringify(bench, null, 2))
  } catch {
    // fail silent
  }
}

async function resolveParent(sessionID: string): Promise<string | undefined> {
  if (parentCache.has(sessionID)) return parentCache.get(sessionID)
  try {
    const session = await Session.get(sessionID)
    const parent = session.parentID
    if (parent) parentCache.set(sessionID, parent)
    return parent
  } catch {
    return undefined
  }
}

export namespace Benchmark {
  export function dispatchStart(parentSessionID: string, agent: string) {
    try {
      const bench = ensure(parentSessionID)
      if (!bench.agents[agent]) bench.agents[agent] = { bashCommands: 0 }

      const dispatch: Dispatch = {
        agent,
        startTime: new Date().toISOString(),
        status: "in-progress",
      }
      bench.dispatches.push(dispatch)
      flush(parentSessionID)
    } catch {
      // fail silent
    }
  }

  export function dispatchEnd(parentSessionID: string, agent: string, status: "completed" | "error") {
    try {
      const bench = state.get(parentSessionID)
      if (!bench) return
      const dispatch = [...bench.dispatches].reverse().find((d) => d.agent === agent && d.status === "in-progress")
      if (!dispatch) return

      const endTime = new Date().toISOString()
      bench.engagementEnd = endTime

      dispatch.endTime = endTime
      dispatch.status = status
      flush(parentSessionID)
    } catch {
      // fail silent
    }
  }

  export async function bashCommand(sessionID: string, agent: string) {
    try {
      const parentSessionID = (await resolveParent(sessionID)) ?? sessionID
      const bench = ensure(parentSessionID)
      if (!bench.agents[agent]) bench.agents[agent] = { bashCommands: 0 }
      const stats = bench.agents[agent]
      stats.bashCommands++
      const now = new Date().toISOString()
      if (!stats.firstCommand) stats.firstCommand = now
      stats.lastCommand = now
      bench.engagementEnd = now
      flush(parentSessionID)
    } catch {
      // fail silent
    }
  }
}
