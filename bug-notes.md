Bug note: 4/14/2026 - Resuming a session from a different folder doesn't update the working directory — write tool resolves paths against the original session's folder, not the current pwd. Likely same pattern as the v0.3.4 Instance.worktree vs Instance.directory bug.

Bug note: 04/15/2026 Stale Router prompt in fallback path (no engagement folder)
.txt file on disk is correct (new content)
agent.ts uses fs.readFileSync (confirmed)
No duplicates, no build script overwriting
But /transparent still shows old prompt text when no .opencode/agents/ exists
Unresolved: promptDir runtime resolution never verified
Status: Deferred. Works correctly when engagement folder is scaffolded (.md override path). Fallback-only bug.





## BUG — Per-Agent 04/17/2026 `.md` Frontmatter & Model Resolution

**Status:** Discovery complete. Fix drafted + partially reviewed. **Deferred — not yet shipped.**

### Two bugs, one directive

**Bug A — Frontmatter leaks into system prompt**
- `packages/opencode/src/session/llm.ts` (engagement `.md` read path, IIFE around line 86–94) reads `.opencode/agents/*.md` via raw `fs.readFileSync`. No gray-matter. The `---\r\n...\r\n---` block is injected directly into the LLM system prompt.
- Affects every engagement-overridden agent, not just those with a `model:` hint.
- Verified via `/transparent` — system prompt starts with `"---\r\n#model: ..."`.

**Bug B — Commenting out `model:` doesn't revert**
- `packages/opencode/src/agent/agent.ts:368` → `if (value.model) item.model = Provider.parseModel(value.model)`
- One-way write: sets when present, never clears when absent.
- Combined with cached `Instance.state()` agent map (`state.ts:20-21`), the previously pinned model survives even after the frontmatter key is removed. Full app restart doesn't help because the cache rebuilds the same stale value from the last successful parse if not corrected at the assignment site.

### Proposed fix (drafted, not approved)

- **`llm.ts`** — parse the engagement `.md` with `gray-matter` (already a project dep via `ConfigMarkdown`). Use `parsed.content.trim()` as the prompt body. On parse failure → fall back to raw content (preserve today's silent-fallback behavior). Plain `.md` without frontmatter still works because `matter()` returns full content as `.content`.
- **`agent.ts:368`** — change to `item.model = value.model ? Provider.parseModel(value.model) : undefined` so commented-out `model:` explicitly clears the field, letting the fallback chain (`lastModel → Provider.defaultModel`) take over.

### Open concern before shipping (must resolve first)

Does the `agent.ts:368` code path run **only** for engagement-layer `.md` overrides, or **also** for native/hardcoded agents (the 5 pentest agents + OpenCode defaults) and global `~/.config/opencode/agent/*.md`?

If it also runs for native agents, unconditionally setting `item.model = undefined` may nuke a model set by an earlier loader/merge step.

**Ask Agent 3:** "Does `agent.ts:368` run for every agent source (native, global, engagement), or only engagement overrides? Is `item.model` set anywhere else before this line runs?"

- Answer = "only engagement" or "nothing else sets it" → safe to ship as drafted.
- Answer = "also native agents" → scoped clear needed (only clear if the current load is from an engagement `.md`, not from native definitions).

### Verification matrix (run before shipping)

1. `/transparent` shows no `---` or `#model:` in system prompt after fix.
2. Uncomment `model:` in `router.md` → restart → `/transparent` shows pinned model.
3. Re-comment `model:` → restart → `/transparent` shows session's active global model.
4. Plain `.md` with no frontmatter still loads and runs.

### Related history

- v0.4.6 introduced engagement-folder `.md` override but skipped frontmatter parsing.
- v0.4.9 introduced the commented `# model:` hint — user-facing symptom surfaced here.
- v0.4.9 "needed" already flags hot-reload / file-watcher absence — separate issue, leave deferred.




**Got it. Logging as a deferred feature pin.** 04/17/2026
## PIN — Live Config Change Detection & Restart Prompt

**Status:** Deferred feature. Not building now. For later.

### Goal

When the user modifies anything inside the current engagement folder's `.opencode/` subtree — specifically `skills/`, `agents/`, or `tools/` — the TUI shows a non-blocking warning with a one-command fix.

Example UX: *"Detected changes in `.opencode/skills/`. Run `/restart` to apply."*

### Why

Current behavior: user drops a new skill or edits an agent prompt mid-session → silently ignored due to cached `Instance.state()` + `Config.state()` (see v0.5.x skill invalidation fix). User has no signal that their change isn't live. They think it's broken.

This is the same root gap behind the v0.4.9 "needed" note (no file watcher on `.opencode/agents/*.md`) and the Risk #3 edge case in the skill invalidation fix.

### Scope (when built)

**Watch paths (per engagement):**
- `.opencode/skills/`
- `.opencode/agents/`
- `.opencode/tools/`
- Possibly `.opencode/shared-resources/` (excluding `findings.json` and `bg-tasks/` which change constantly — noise)

**Detection:**
- Bun has `fs.watch` — use it, scope it to the engagement directory only.
- Debounce (500ms-ish) to avoid spamming on save-while-typing.

**User signal:**
- TUI toast / status bar indicator: "Config changed — /restart to apply"
- Optional: highlight in a persistent corner until resolved.

**New slash command:**
- `/restart` — cleanly disposes the current Instance (triggering cached state cleanup via the now-working `invalidate()` wrappers), then re-bootstraps. Effectively a soft restart without killing the whole app.
- Alternative: `/reload` if `/restart` feels too heavy.

### Current workaround (user stays informed how)

Today: user must fully quit `map-dev` and restart the process. New process → fresh Instance → fresh cache. Works because the invalidation fix handles the scaffold path; for manual post-scaffold edits, a full restart is the only way.

### Out of scope for this pin

- Auto-reload without user consent (too magical, could interrupt running dispatches).
- Watching files outside `.opencode/` (engagement root clutter).
- Hot-reload of agent `.md` prompts mid-LLM-call (separate deeper concern).

### Related open pins

- **Per-agent `.md` frontmatter leak + stale model** — different bug, same "no hot reload" family.
- **v0.4.9 "needed" — no file watcher on agents** — this pin would close that.

### When to build

After current engagement-feature stability lands and basic CTF stress tests pass. Not before.
