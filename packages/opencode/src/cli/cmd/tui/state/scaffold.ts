import { createSignal } from "solid-js"

export const [scaffoldingSessions, setScaffoldingSessions] = createSignal<string[]>([])

export function addScaffold(sessionID: string) {
  setScaffoldingSessions((prev) => [...prev, sessionID])
}

export function removeScaffold(sessionID: string) {
  setScaffoldingSessions((prev) => prev.filter((id) => id !== sessionID))
}
