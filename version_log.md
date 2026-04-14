{
  "version": "0.4.1",
  "date": "2026-04-14",
  "focus": "Benchmark Findings Snapshot Removal",
  "changes": [
    "Removed the findings.json snapshot tracking mechanism (findings-before-*.json / findings-after-*.json) from benchmark.ts."
  ]
}


{
  "version": "0.4.0",
  "date": "2026-04-09",
  "focus": "AI Engagement Auto-Fill Hardening",
  "changes": [
    "Implemented automatic UX recovery for engagement auto-fill: TUI now returns to the main form on failure instead of stalling in the generator dialog.",
    "Enhanced error clarity in TUI by parsing specific server-side error messages (e.g., 'Failed to parse AI response') from the response body.",
    "Hardened server-side JSON extraction using robust string indexing to find the outermost braces, effectively filtering AI chatter and markdown wrapping.",
    "Integrated non-JSON response safety in the TUI fetch pipeline to prevent secondary crashes when parsing error payloads from network proxies."
  ]
}


{
  "version": "0.3.9",
  "date": "2026-04-08",
  "focus": "Pentest Agent Prompt Tool Priority & Fallback",
  "changes": [
    "Synchronized a strict network tool priority directive across all 10 pentest agent prompt sources (Router, Recon, Explorer, Coder, Report) in both .md and .txt formats.",
    "Enforced mandatory use of MCP 'kali-pentest' tools for all network-related operations (nmap, gobuster, curl, etc.) to ensure structured result parsing.",
    "Implemented explicit fallback instructions for agents to use local OS-native commands via BashTool if the MCP server is unreachable or down.",
    "Simplified agent decision-making by restricting BashTool primarily to local filesystem operations and text processing unless as a network fallback.",
    "Synchronized Router planning logic to prioritize structured MCP capabilities when assigning tasks to sub-agents."
  ]
}


{
  "version": "0.3.8",
  "date": "2026-04-08",
  "focus": "BashTool Real-time Progress Streaming",
  "changes": [
    "Implemented real-time stdout streaming for BashTool tasks, allowing pentest agents to see intermediate results during long-running commands.",
    "Integrated a throttled onProgress callback (every 3 seconds) into PtySession and ShellSession polling loops to yield partial command output.",
    "Updated BashTool to emit 'streaming: true' metadata blocks, ensuring agent context is continuously updated without waiting for command completion or background detachment.",
    "Synchronized partial output cleaning across Windows and Unix sessions, including ANSI stripping and sensitive prompt filtering for streamed data."
  ]
}


{
  "version": "0.3.7",
  "date": "2026-04-08",
  "focus": "BashTool Command Semantics Interpretation",
  "changes": [
    "Created a new 'command-semantics.ts' module to intelligently interpret pentest tool output, distinguishing between genuine failures and expected non-zero exits (e.g., grep finding no matches).",
    "Transitioned from strict numerical exit-code-only evaluations to stdout content analysis; tools producing meaningful payload data are now frequently pardoned despite non-zero exit codes.",
    "Integrated semantic logic into BashTool specifically for pentest agents, suppressing 'Exit code: N' UI spam on expected behaviors to eliminate false-positive agent retries.",
    "Added a new 'isExpectedExit' boolean metadata flag to tool output payloads without overwriting the native integer 'exit' code."
  ]
}


{
  "version": "0.3.6",
  "date": "2026-04-08",
  "focus": "BashTool Proactive Background Execution",
  "changes": [
    "Implemented non-blocking background execution for long-running pentest commands via a new 'run_in_background' parameter in BashTool.",
    "Integrated a 30-second 'PENTEST_BACKGROUND_BUDGET' that automatically detaches commands if they exceed the time threshold, preventing agent blocking during recon/scanning.",
    "Refactored PtySession and ShellSession with a .detach() mechanism that orphans time-intensive tasks while immediately spawning fresh, interactive sessions for continued agent work.",
    "Added persistent background logging to '.opencode/shared-resources/bg-tasks/' with timestamps and session tracking.",
    "Updated all 5 pentest agent prompts (Router, Recon, Explorer, Coder, Report) in both .md and .txt formats with bg-task monitoring and orchestration logic.",
    "Hardened Router logic to track background tasks log paths and verify completion status before proceeding with dependent plan steps."
  ]
}


{
  "version": "0.3.5",
  "date": "2026-04-07",
  "focus": "Transparent Shell Timeout Recovery in BashTool",
  "changes": [
    "Added a retry loop extending the 'bash' command execution to a maximum of 5 attempts to cleanly handle timeouts transparently.",
    "Added a 30-second delay between retry attempts for timed out commands.",
    "Integrated a consecutive timeout tracker per 'sessionID'. When 3 consecutive timeouts occur, the current underlying 'PtySession' or 'ShellSession' is automatically killed and structurally replaced.",
    "Injected a fallback warning metadata tag 'WARNING: Shell was reset after repeated timeouts' that alerts agents contextually without failing tasks manually."
  ]
}


{
  "version": "0.3.4",
  "date": "2026-04-06",
  "focus": "Compiled Binary Pentest Asset Embedding & Scaffolding Target Fix",
  "changes": [
    "Fixed a critical bug where pentest agent files were missing from the compiled binary because dynamic directory reads (via fs.readdir) are unaware of implicit assets. Used Bun.Glob to add src/agent/pentest/ recursively directly into Bun.build entrypoints.",
    "Modified scaffold() invocation in session.ts from scaffold(Instance.worktree) to scaffold(Instance.directory). This guarantees that new engagements deployed in non-git directories write .opencode folders locally rather than misidentifying workspace roots."
  ]
}


{
  "version": "0.3.3",
  "date": "2026-04-06",
  "focus": "Subagent PTY Inline Input (INCOMPLETE / UNTESTED)",
  "changes": [
    "Added POST /pty/:ptyID/input API route to stream text directly to a PTY session's stdin.",
    "Added GET /pty/by-session/:sessionID API route to map sub-agent sessions to their underlying PTY instances.",
    "Pivoted from an unsuccessful full-screen PTY takeover approach to an inline TUI input field model.",
    "Modified TUI keyboard event handlers to route keystrokes into the new inline terminal input.",
    "WARNING: This implementation is currently INCOMPLETE and UNTESTED. Interaction blockers may still exist preventing full bidirectional communication."
  ]
}


{
  "version": "0.3.2",
  "date": "2026-04-06",
  "focus": "Subagent findings.json Write Fixes",
  "changes": [
    "Fixed missing YAML frontmatter delimiter (---) in recon.md which caused the agent's permission ruleset to fail to load.",
    "Added explicit path resolution notes to all 4 subagent prompts in both their .txt and .md formats.",
    "Instructed agents to use base relative paths (e.g. .opencode/shared-resources/findings.json) without prefixing workspace subdirectories like packages/, matching WriteTool's runtime resolution behavior."
  ]
}


{
  "version": "0.3.1",
  "date": "2026-04-01",
  "focus": "Skills Appearing as Agents Bug Fix",
  "changes": [
    "Root cause: copyRecursive for agents pointed at the entire pentest/ source dir, which contains skills/, tools/, shared-resources/ subdirs. These landed inside .opencode/agents/. AGENT_GLOB is recursive ({agent,agents}/**/*.md) so it swept up SKILL.md files nested under agents/skills/ and registered them as agents.",
    "Fix: replaced the agents copyFiles block with a flat-only copyAgents helper that uses readdir() and filters to .md files that are plain files — directories like skills/ and tools/ are skipped entirely.",
    "Result: .opencode/agents/ now contains only the 5 agent definition files (router, recon, explorer, coder, report). Skills remain isolated in .opencode/skills/.",
    "Note: existing engagements scaffolded before this fix must manually delete .opencode/agents/skills/ and .opencode/agents/tools/ to clear stale data."
  ]
}


{
  "version": "0.3.0",
  "date": "2026-04-01",
  "focus": "Skill Cache Invalidation After Scaffold",
  "changes": [
    "Root cause identified: Skill.state() is a one-time lazy cache (Instance.state). It evaluates on session init — before scaffold runs — and freezes an empty result. Agents always saw 0 skills even after .opencode/skills/ was populated.",
    "Added State.invalidate(key, init) to state.ts: surgically deletes a single cache entry by instance key + init function reference without disturbing Config, ToolRegistry, or other state.",
    "Added Skill.invalidate() to skill.ts: calls State.invalidate with the current Instance.directory and the skill state init ref.",
    "scaffold() in session.ts now calls Skill.invalidate() after all file copies complete — forcing a fresh disk scan on the next skill() tool call."
  ]
}


{
  "version": "0.2.9",
  "date": "2026-04-01",
  "focus": "Agent Prompt Skill Invocation Sync",
  "changes": [
    "Audited all 5 pentest agent prompts (router, recon, explorer, coder, report) in both prompt/*.txt and pentest/*.md locations.",
    "Router: was missing skill invocation entirely — added skill(\"scope-checker\") as step 1 of Start each task in both router.txt and router.md.",
    "Recon: was missing scope-checker and recon-patterns from skill list — added both with explicit call order: scope-checker first, then recon-patterns, then nmap-recon, then OS-specific skill.",
    "Explorer, Coder, Report: already correctly instructed skill loading — no changes needed."
  ]
}


{
  "version": "0.2.8",
  "date": "2026-04-01",
  "focus": "Subagent shared-resources Permission Hardening",
  "changes": [
    "All pentest subagents (recon, explorer, coder, report) now have explicit read/write/edit allow rules scoped to .opencode/shared-resources/* — prevents permission denials when appending to findings.json.",
    "Router: added write + edit allow for shared-resources (was read-only before).",
    "Coder: shared-resources edit is allow while all other edit paths remain ask.",
    "Added temporary [DIAG] log in Skill.state() to emit resolved skill paths and configDirs at runtime — marked for removal after verification."
  ]
}


{
  "version": "0.2.7",
  "date": "2026-04-01",
  "focus": "Scaffold copyFiles Silent-Failure Fix",
  "changes": [
    "Replaced the flat 2-level copyFiles() loop in scaffold() with a full copyRecursive() helper — handles arbitrary directory depth so skill subdirs with scripts/ or resources/ are never truncated.",
    "Silent early-return on missing source dir replaced with a warning toast + log.warn showing the actual unresolved path — makes import.meta.dir resolution failures visible at runtime.",
    "Error catch now includes sourceDir and targetDir in the log entry for full path context.",
    "log.info emitted at the start of each copyFiles call so resolved paths appear in the dev console before any copy attempt."
  ]
}


{
  "version": "0.2.6-BUGFIX",
  "date": "2026-03-24",
  "focus": "MCP Tool Timeout Resolution",
  "changes": [
    "Resolved MCP tool timeout issues (McpError -32001) for long-running pentest tools (e.g., nmap).",
    "Documented that users can configure a custom `timeout` (in milliseconds, e.g., 300000 for 5 minutes) per MCP server in `opencode.json` to override the default 60-second limit."
  ]
}


{
  "version": "0.2.6",
  "date": "2026-03-24",
  "focus": "Subagent MCP Tool Execution Integration",
  "changes": [
    "Resolved MCP tool access blocks for subagents by updating the native permission baseline (`\"*\": \"allow\"`) for all pentest agents.",
    "Verified full end-to-end execution capability of external MCP tools (like kali-pentest) directly within subagent processes.",
    "Identified and documented that long-running MCP tool executions (like exhaustive nmap scans) will currently trigger strict protocol timeouts (`McpError -32001`) if they exceed 60 seconds."
  ]
}


{
  "version": "0.2.5",
  "date": "2026-03-24",
  "focus": "Engagement Setup Stability & UX",
  "changes": [
    "Added automatic scaffolding check when an engagement session is loaded in the TUI: automatically triggers setup and shows a loading animation if .opencode/shared-resources/findings.json is missing.",
    "Fixed a silent crash in the session load by substituting Instance.worktree (backend-only context) with sync.data.path.worktree.",
    "Corrected widespread invalid permission schemas (`\"*\": true` changed to `\"*\": allow`) in all native pentest agent templates to satisfy SDK Action schema validation."
  ]
}


{
  "version": "0.2.4-BUGFIX",
  "date": "2026-03-19",
  "focus": "Pentest Agent Auto-Load on Clone",
  "changes": [
    "Converted pentest agents (Router, Recon, Explorer, Coder, Report) into fully hardcoded native agents inside agent.ts so they always load independently of the file system.",
    "Router is now visible in the agent Tab cycle out-of-the-box on fresh clones.",
    "Sub-agents (Recon, Explorer, Coder, Report) are native but natively hidden from the Tab cycle to keep the UI clean, while still being dispatchable by Router.",
    "Removed the previous config.ts loadPentest() directory scoping workaround as it relied on file existence inside packages/opencode/src/agent/pentest/."
  ]
}


{
  "version": "0.2.4",
  "date": "2026-03-18",
  "focus": "Agent MCP Tool Awareness & Self-Discovery",
  "changes": [
    "All four agent prompts (Router, Recon, Explorer, Coder) now include a 'Tool Discovery (Do This First)' block before their Execution Rules section.",
    "Agents are instructed to check for MCP tools at task start and prefer them (structured output) over BashTool (raw), with install-on-demand as last resort.",
    "Priority order baked into all agents: MCP tool → BashTool → Install then BashTool.",
    "Router: added MCP awareness into the planning step — factors Kali MCP tools (nmap_scan, gobuster_scan, etc.) into task assignment.",
    "Recon: added 'For scanning and enumeration' MCP guidance — prefer nmap_scan, gobuster_scan, nikto_scan, enum4linux_scan when available.",
    "Explorer: added 'For web probing and service interaction' guidance — prefer gobuster_scan, nikto_scan, dirb_scan, sqlmap_scan; use execute_command for arbitrary remote Kali ops.",
    "Coder: added 'For script writing and execution' guidance — use execute_command MCP tool to run scripts on remote Kali when available.",
    "Report: no changes — no execution, no tool awareness needed."
  ]
}


{
  "version": "0.2.3",
  "date": "2026-03-18",
  "focus": "opencode.json Engagement Scaffold",
  "changes": [
    "scaffold() in session.ts now writes opencode.json to the engagement root (worktree) on /engagement save.",
    "Content: { \"mcp\": {} } — an empty MCP section ready for user-defined server configs.",
    "Idempotent: skips write with a warning toast if opencode.json already exists (preserves user customizations).",
    "Follows the existing fail-silent pattern (try/catch + Bus.publish toast on error).",
    "No new imports required — uses path, fs, Bus, TuiEvent, and log already in scope."
  ]
}


{
  "version": "0.2.2",
  "date": "2026-03-17",
  "focus": "Benchmark Logging Harness",
  "changes": [
    "New: packages/opencode/src/benchmark/benchmark.ts — singleton, in-memory state keyed by parent sessionID, fail-silent writes to .opencode/shared-resources/benchmark-log.json.",
    "Captures: engagement start/end time, per-agent bash command count + first/last timestamps, ordered dispatch log with status, findings.json before/after snapshots per agent dispatch.",
    "task.ts: Benchmark.dispatchStart() before agent runs, Benchmark.dispatchEnd() in existing .finally() — zero change to existing flow.",
    "bash.ts: Benchmark.bashCommand() fires after each successful command. Child→parent sessionID resolved once and cached.",
    "All logging is fail-silent — a write error never blocks an agent task."
  ]
}


{
  "version": "0.2.1",
  "date": "2026-03-17",
  "focus": "findings.json Write Pipeline Fixes",
  "changes": [
    "recon.md: fixed write procedure to explicitly say 'using WriteTool' — now matches Explorer, Coder, Report exactly.",
    "All four sub-agents (Recon, Explorer, Coder, Report): added WriteTool retry + fallback instruction. If WriteTool fails twice, agent reports error and finding data to Router inline."
  ]
}


{
  "version": "0.2.0",
  "date": "2026-03-17",
  "focus": "Configurable Shell Timeout",
  "changes": [
    "Added OPENCODE_SHELL_TIMEOUT flag to flag.ts (seconds, default 300). Converts to ms at read time.",
    "ShellSession.execute() accepts optional timeoutMs parameter; falls back to Flag.OPENCODE_SHELL_TIMEOUT.",
    "BashTool threads its resolved timeout into all session.execute() calls — cd, main command.",
    "Debug pwd call pinned at 5s independently to avoid inheriting long pentest timeouts.",
    "Error message now includes actual timeout value for easier debugging."
  ]
}


{
  "version": "0.1.9",
  "date": "2026-03-17",
  "focus": "Shell Mode No-Session Guard",
  "changes": [
    "Added guard in submit() in prompt/index.tsx: if shell mode is active but no session exists, block command execution.",
    "Shows warning toast 'Start a conversation to activate Shell' instead of silently creating a session.",
    "Existing shell mode behavior inside an active session is unchanged."
  ]
}


{
  "version": "0.1.8",
  "date": "2026-03-17",
  "focus": "OS-Aware Layer 4 Agent Prompts",
  "changes": [
    "Updated explorer.md: replaced flat skill list with OS-aware block matching recon.md's pattern.",
    "Explorer now loads linux-pentest for Linux/macOS targets and powershell-windows for Windows targets, in addition to web-exploitation and ctf-methodology.",
    "Updated coder.md: replaced flat skill list with OS-aware block.",
    "Coder now loads scope-checker first, then linux-pentest or powershell-windows based on target OS — scripts must use correct shell syntax.",
    "recon.md and router.md untouched per directive."
  ]
}


{
  "version": "0.1.7",
  "date": "2026-03-17",
  "focus": "OS-Aware Shell Injection",
  "changes": [
    "Added shell detection to SystemPrompt.environment() in system.ts: PowerShell on win32, bash otherwise.",
    "Injected 'Shell: <type>' field into the <env> block sent to every agent on every session.",
    "Added hard instruction after </env>: 'Always use commands compatible with the Shell above. Never use bash on Windows or PowerShell on Linux.'",
    "Zero-code change for agents — all benefit automatically via Layer 2 environment context."
  ]
}


{
  "version": "0.1.6",
  "date": "2026-03-17",
  "focus": "Autorun Permission Toggle",
  "changes": [
    "Added OPENCODE_AUTORUN mutable flag to flag.ts, defaulting to false (safe mode).",
    "Modified PermissionNext.evaluate() to override 'ask' actions to 'allow' when OPENCODE_AUTORUN is enabled.",
    "Registered /autorun slash command in session route: toggles autorun on/off with a toast confirmation.",
    "Registered /autorun on home route with a warning toast: 'Start a session first to use autorun!'.",
    "Default behavior unchanged — user confirmation is still required unless autorun is explicitly toggled on."
  ]
}


{
  "version": "0.1.5",
  "date": "2026-03-12",
  "focus": "Engagement Form UX Enhancements",
  "changes": [
    "Fixed focus management: clicking a field now correctly sets focus and highlights the field label.",
    "Integrated scroll-to-focus: the dialog automatically scrolls focused fields into view during keyboard and mouse navigation.",
    "Improved visual aesthetics: implemented rounded borders, active background colors, and padded containers for the active field.",
    "Added a translucent loading overlay to the session view that appears during the backend scaffolding process.",
    "Streamlined agent orchestration: the application now auto-switches back to the Router agent seamlessly upon engagement submission."
  ]
}


{
  "version": "0.1.4",
  "date": "2026-03-07",
  "focus": "Multi-Terminal Agent Architecture",
  "changes": [
    "Implemented per-agent isolated ShellSessions to prevent shared terminal hangs.",
    "Scoped permission and question prompts directly to child agent views in TUI.",
    "Refactored TaskTool to reuse existing persistent child agent sessions on re-dispatch.",
    "Added ShellSession cleanup to Session.remove() for cascading deletion of shells."
  ]
}


{
  "version": "0.1.3-BUGFIX-SKILLS",
  "date": "2026-03-02",
  "focus": "Skill Resolution Mismatch",
  "changes": [
    "Restructured pentest skills into [name]/SKILL.md format to comply with SkillTool requirements.",
    "Injected valid YAML frontmatter (name, description) into all pentest skills.",
    "Updated /engagement auto-scaffold logic to recursively copy nested skill directories."
  ]
}


{
  "version": "0.1.3-BUGFIX",
  "date": "2026-03-02",
  "focus": "Engagement Submit Model Leak",
  "changes": [
    "Fixed model leak on engagement form submit.",
    "Form-filling model is now scoped only to the form.",
    "Session strictly inherits the active global model on save."
  ]
}


{
  "version": "0.1.3",
  "date": "2026-02-25",
  "focus": "Pentest Agent Execution & Approval Flow",
  "changes": [
    "Activated direct BashTool execution for Recon agent, with explicit 'ask' user approval gate for security.",
    "Enabled bash execution for Explorer with 'ask' mapping, alongside 'allow' for webfetch and websearch probing.",
    "Granted Coder agent direct WriteTool and BashTool execution to test scripts, both relying on 'ask' approval.",
    "Updated Router agent prompt to orchestrate tool execution naturally without executing commands itself.",
    "Corrected Report agent permissions to explicitly deny bash while retaining safe filesystem read/write access."
  ]
}


{
  "version": "0.1.2",
  "date": "2026-02-19",
  "focus": "vLLM Auto-Discovery & Hot-Swap Model Routing",
  "changes": [
    "Added auto-discovery for local vLLM instances (http://localhost:8000/v1/models).",
    "Implemented hot-swap capability to switch between Ollama and vLLM models mid-session.",
    "Enriched available-models.json with provider, source, baseURL, and tools metadata.",
    "Updated /models command to display [provider] tags (e.g., [vllm], [ollama]).",
    "Fixed TUI 'Select model' dialog to correctly group Recent models under their Provider headers."
  ]
}


{
  "version": "0.1.1",
  "date": "2026-02-18",
  "focus": "Pentest Toolkit Skill System & Agent Enhancement",
  "changes": [
    "Added 5 default skill files to src/agent/pentest/skills/: ctf-methodology, recon-patterns, web-exploitation, report-format, scope-checker.",
    "Extended scaffold() to copy skills/ into .opencode/skills/ on /engagement save (skip-if-exists, per-file).",
    "Extended scaffold() to create empty .opencode/tools/ directory for future custom tool registration.",
    "Added Bus.publish TuiEvent.ToastShow notifications to all scaffold steps (start, success, skip, error).",
    "Enabled skill: true in all 5 pentest agent frontmatter configs.",
    "Wired skill loading instructions into each agent: Router loads scope-checker, Recon loads recon-patterns + scope-checker, Explorer loads web-exploitation + ctf-methodology, Coder loads ctf-methodology + scope-checker, Report loads report-format."
  ]
}


{
  "version": "0.1.0",
  "date": "2026-02-18",
  "focus": "PenTest MoE — Mixture of Expert Agents Architecture",
  "changes": [
    "Introduced PenTest MoE orchestration: Router primary agent with 4 specialist sub-agents (Recon, Explorer, Coder, Report).",
    "Auto-scaffold .opencode/agents/ with default pentest agent configs on /engagement save (skip-if-exists).",
    "Auto-scaffold .opencode/shared-resources/findings.json for cross-agent findings and activity logging.",
    "Auto-generate available-models.json listing all configured AI models for per-agent model assignment.",
    "Added map-dev command for running modified OpenCode from any directory via OPENCODE_CWD override.",
    "Fixed project directory fallback to use cwd instead of '/' when no .git found.",
    "Router agent presents plans in chat for user approval before dispatching to sub-agents."
  ]
}

{
  "version": "0.0.9",
  "date": "2026-02-15",
  "focus": "Engagement Prompt Refactor & Auto-Fill Stability",
  "changes": [
    "Refactored Engagement Prompt to be file-based (src/agent/prompt/engagement.txt) for easier editing and versioning.",
    "Migrated AI Auto-Fill logic to Server-Side Execution to ensure consistent environment access.",
    "Implemented strict JSON enforcement for Engagement Generation to prevent 500 errors with custom prompts.",
    "Enhanced Engagement Dialog UI with dedicated 'Edit Prompt' dialog and 'Reset to Default' functionality.",
    "Fixed persistence issues where custom engagement prompts were not saving correctly."
  ]
}

{
  "version": "0.0.8-BUGFIX",
  "date": "2026-02-12",
  "focus": "Session Prompt Editor Persistence",
  "changes": [
    "Fixed critical issue where custom system prompts were not persisting across session restarts.",
    "Implemented session-level storage for prompt overrides in JSON persistence layer.",
    "Fixed TUI prompt editor to correctly hydrate changes from saved session data."
  ]
}

{
  "version": "0.0.8",
  "date": "2026-02-09",
  "focus": "Session Prompt Editor",
  "changes": [
    "Added '/prompts' slash command to view all system and agent prompts.",
    "Dialog displays active prompt based on currently selected model.",
    "Full prompt content shown in expanded view (no truncation).",
    "Created SessionPromptCache module for session-scoped prompt overrides with 4-hour TTL.",
    "Integrated cache cleanup into Session.remove() for automatic cleanup.",
    "Modified llm.ts to check cache for system prompt overrides before using defaults.",
    "Added 'customPrompt' flag to Transparent logger RequestData.",
    "Added Edit UI with textarea, Save/Cancel buttons, and edited indicator.",
    "KNOWN ISSUE: Save functionality (Ctrl+S and button click) does not work."
  ]
}

{
  "version": "0.0.7",
  "date": "2026-02-08",
  "focus": "Transparent Data Flow Logger",
  "changes": [
    "Added '/transparent' slash command (aliases: '/io', '/raw') to view raw AI communication logs.",
    "Implemented session-scoped I/O logging capturing request payloads before AI streaming.",
    "Log data stored at ~/.local/share/opencode/transparent/{sessionID}.json.",
    "Automatic cleanup: logs deleted when session is removed.",
    "Dialog UI shows timestamped entries with expandable JSON details."
  ]
}

{
  "version": "0.0.6",
  "date": "2026-02-08",
  "focus": "Local Ollama Auto-Detection & Build Script Enhancements",
  "changes": [
    "Backend now auto-detects local Ollama instances at startup (http://localhost:11434).",
    "Detected Ollama models are registered as a 'ollama' provider with dynamic model list.",
    "Added 'ollama' custom loader to Provider system for OpenAI-compatible API routing.",
    "Fixed null-safe access in header.tsx preventing crash on model.limit.context.",
    "Enhanced '-Nuke' flag in build.ps1 for complete data reset:",
    "  - Wipes XDG state (~/.local/state/opencode): favorites, recent models, prompt history.",
    "  - Wipes XDG data (~/.local/share/opencode): API keys (auth.json), sessions, storage.",
    "  - Wipes XDG cache (~/.cache/opencode): model definitions, LSP servers.",
    "  - Preserves XDG config (~/.config/opencode): Ollama/provider settings, agents, opencode.json."
  ]
}

{
  "version": "0.0.5",
  "date": "2026-02-04",
  "focus": "Shell Integration & UX Stability",
  "changes": [
    "Unified Agent and Shell cycling: 'Tab' now cycles through Agents -> Shell -> Agents.",
    "Integrated Shell Mode into the main agent loop, removing need for separate toggle keybind.",
    "Made Shell Mode persistent: Shell remains active after executing commands (REPL behavior).",
    "Fixed TUI crash during mode switching caused by placeholder undefined state."
  ]
}

{
  "version": "0.0.4",
  "date": "2026-02-03",
  "focus": "Shell Architecture: Standardization & Persistence",
  "changes": [
    "Phase A (Standardization): Enforced PowerShell usage on Windows TUI for consistent environment.",
    "Phase B (Persistence): Implemented shared singleton shell session for AI assistant and user commands.",
    "Phase B (Persistence): Resolved directory state resets and cleaned up command output echoing."
  ]
}


{
  "version": "0.0.3",
  "date": "2026-02-01",
  "focus": "Status View Enhancements",
  "changes": [
    "Implemented 'Verbose' status view displaying detailed configuration (Version, CWD, Model, Base URL, Session ID).",
    "Added arrow key navigation (Left/Right) to toggle between Standard and Verbose status views.",
    "Updated Status dialog UI to include view switching hints."
  ]
}










{
  "version": "0.0.2",
  "date": "2026-02-01",
  "focus": "UX & Accessibility",
  "changes": [
    "Added 'Ctrl+Shift+S' and 'Alt+S' as alternative keybindings for the Command Palette to resolve IDE conflicts."
  ]
}







{

"version": "0.0.1",
      "date": "2026-02-01",
      "focus": "Visual Branding Transition",
      "changes": [
        "Replaced 'OpenCode' ASCII logo with 'MAP' block-style logo in TUI startup and help screens.",
        "Updated TUI window title, status bars, and welcome messages to 'MAP'.",
        "Renamed CLI script execution context from 'opencode' to 'map'."
      ]
    }





1/31/2026: I initiated dev container. It works but not been tested. 



