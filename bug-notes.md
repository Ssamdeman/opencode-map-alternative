Bug note: 4/14/2026 - Resuming a session from a different folder doesn't update the working directory — write tool resolves paths against the original session's folder, not the current pwd. Likely same pattern as the v0.3.4 Instance.worktree vs Instance.directory bug.

Bug note: 04/15/2026 Stale Router prompt in fallback path (no engagement folder)
.txt file on disk is correct (new content)
agent.ts uses fs.readFileSync (confirmed)
No duplicates, no build script overwriting
But /transparent still shows old prompt text when no .opencode/agents/ exists
Unresolved: promptDir runtime resolution never verified
Status: Deferred. Works correctly when engagement folder is scaffolded (.md override path). Fallback-only bug.