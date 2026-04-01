# OpenCode Agent Prompt Source Map

This document tracks the assembly chain for system prompts across all agents in the OpenCode platform.

## 1. Prompt Assembly Architecture

System prompts are constructed dynamically at runtime through five distinct layers. The final string is joined by newlines and sent to the LLM.

### The Five Layers (Priority Order)

| Layer | Source Code | Description |
| :--- | :--- | :--- |
| **Layer 1: Agent Header** | `llm.ts:85-91` | The "Core Identity". Uses agent-specific prompt (from `agent.ts`) OR falls back to LLM-specific instructions. |
| **Layer 2: Environment** | `system.ts:43-69` | Runtime context: CWD, Platform, Shell (PowerShell/bash), and Today's Date. |
| **Layer 3: Global Instructions** | `instruction.ts:113-140` | Project-specific rules from files like `AGENTS.md`, `CLAUDE.md`, or `CONTEXT.md`. |
| **Layer 4: User Injection** | `llm.ts:95` | Any ephemeral system prompt instructions injected by the last user message. |
| **Layer 5: Plugin Transform** | `llm.ts:103` | Final modification layer via the `experimental.chat.system.transform` plugin hook. |

---

## 2. Agent-Specific Prompt Audit

For each native agent, the "Layer 1" prompt is defined in `packages/opencode/src/agent/agent.ts` using static imports from `packages/opencode/src/agent/prompt/`.

### **Router**
- **Native Source:** [router.txt](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/prompt/router.txt)
- **Defined In:** [agent.ts#L141](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/agent.ts#L141)
- **Permissions:** Full orchestrator access; restricted from `kali*` tools directly.
- **Override Path:** `config.toml` -> `[agent.router] prompt = "..."`

### **Recon**
- **Native Source:** [recon.txt](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/prompt/recon.txt)
- **Defined In:** [agent.ts#L162](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/agent.ts#L162)
- **Override Path:** `config.toml` -> `[agent.recon] prompt = "..."`

### **Explorer**
- **Native Source:** [explorer.txt](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/prompt/explorer.txt)
- **Defined In:** [agent.ts#L186](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/agent.ts#L186)
- **Override Path:** `config.toml` -> `[agent.explorer] prompt = "..."`

### **Coder**
- **Native Source:** [coder.txt](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/prompt/coder.txt)
- **Defined In:** [agent.ts#L209](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/agent.ts#L209)
- **Override Path:** `config.toml` -> `[agent.coder] prompt = "..."`

### **Report**
- **Native Source:** [report.txt](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/prompt/report.txt)
- **Defined In:** [agent.ts#L231](file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/agent/agent.ts#L231)
- **Override Path:** `config.toml` -> `[agent.report] prompt = "..."`

---

## 3. The "Priority Win" Hierarchy

When multiple prompts are available for an agent, the system resolves them in this order:

1.  **User Config Override:** `config.toml` (highest priority).
2.  **Hardcoded Native Agent Prompt:** Imported in `agent.ts` from `prompt/*.txt`.
3.  **Prompt Cache:** `SessionPromptCache` (only if the agent has NO hardcoded or configured prompt).
4.  **Provider Default:** `SystemPrompt.provider(model)` (e.g., `PROMPT_BEAST` for GPT-4o, `PROMPT_GEMINI` for Gemini).

> [!IMPORTANT]
> A cached prompt **cannot** override an agent's hardcoded prompt if that agent is a native agent (like Router or Recon), because `input.agent.prompt` is checked before `cachedSystemPrompt` in `llm.ts`.

---

## 4. Orphaned Prompt Files

The following files exist in the repository but are **not loaded** by any code in the current version of the platform:

- `packages/opencode/src/agent/pentest/router.md`
- `packages/opencode/src/agent/pentest/recon.md`
- `packages/opencode/src/agent/pentest/explorer.md`
- `packages/opencode/src/agent/pentest/coder.md`
- `packages/opencode/src/agent/pentest/report.md`

These appear to be legacy Markdown-formatted versions of the prompts that were replaced by the `.txt` files in `packages/opencode/src/agent/prompt/`.

---

## 5. Global Instruction Chain

The **Instruction Layer** (`Layer 3`) searches the following locations in order:

1.  **Project Root Search:** `find-up` for `AGENTS.md`, `CLAUDE.md`, or `CONTEXT.md` starting from the current directory up to the workspace root.
2.  **Global Config:** `~/.config/opencode/AGENTS.md`.
3.  **Claude Defaults:** `~/.claude/CLAUDE.md`.
4.  **Explicit Config:** Any file paths or URLs listed in the `instructions` array in `config.toml`.

> [!NOTE]
> Environment information (Layer 2) is always injected after the Agent Header but before Global Instructions.
