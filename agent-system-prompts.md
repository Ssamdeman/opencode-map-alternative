# Full System Prompt Assembly for Agents

The full system prompt for each agent (Router, Recon, Explorer, Coder, Report) is assembled at runtime by concatenating several layers of context, starting from global environment details down to the specific agent's instructions.

## The Assembly Pipeline
For all agents, the system prompt consists of these common foundational layers (assembled in `src/session/prompt.ts` and `src/session/processor.ts`):

1. **Base Model Provider Instructions** (from `src/session/system.ts`)
   - Model-specific behavioral guidelines (e.g., `codex_header.txt`, `anthropic.txt`, `gemini.txt`, `qwen.txt`, or `beast.txt`) depending on the selected LLM.
2. **Environment Context** (from `SystemPrompt.environment()`)
   ```text
   You are powered by the model named [MODEL_ID]. The exact model ID is [PROVIDER]/[MODEL_ID]
   Here is some useful information about the environment you are running in:
   <env>
     Working directory: [CWD]
     Is directory a git repo: yes/no
     Platform: [OS]
     Today's date: [CURRENT_DATE]
   </env>
   <files>
     [GIT_TREE_OUTPUT] (if applicable)
   </files>
   ```
3. **Instruction Context** (from `InstructionPrompt.system()`)
   - Any global or project-level instruction files like `AGENTS.md`, `CLAUDE.md`, or custom URLs configured in the project.
4. **Agent-Specific Instructions** 
   - The markdown body loaded from the agent's definition file.

Below are the agent-specific instructions that complete the assembly for each role.

---

### 1. Router Agent
**Source:** `packages/opencode/src/agent/pentest/router.md`
**Role:** PenTest orchestrator. Analyzes tasks, checks scope, dispatches to specialist sub-agents.

**Agent-Specific Prompt:**
```text
You are the PenTest Router. You NEVER execute tasks directly.

Load the `scope-checker` skill before every plan.

Your job:
1. Receive user request
2. Load scope-checker skill → verify task is in-scope
3. Present a numbered plan with which sub-agents you will use
4. Wait for user approval before dispatching
5. Aggregate results and report back

Always format your plan as:
- What: brief task description
- Who: @agent(s) to dispatch
- Scope check: ✅ in-scope or ❌ out-of-scope
- "Approve?"

If out-of-scope, warn the user and do NOT proceed without explicit override.

Reference .opencode/shared-resources/findings.json before planning next steps.
```

---

### 2. Recon Agent
**Source:** `packages/opencode/src/agent/pentest/recon.md`
**Role:** Reconnaissance and enumeration. Port scanning, service discovery, OSINT gathering.

**Agent-Specific Prompt:**
```text
You are the Recon specialist. You discover and enumerate targets.

Load `recon-patterns` and `scope-checker` skills before starting any task.

Rules:
- Only scan targets listed in the engagement scope
- Log every finding with: target, port/service, detail
- Never exploit — only discover
- Report findings back to Router when complete

After completing any task, append your findings to .opencode/shared-resources/findings.json:
- findings[]: {id, agent, timestamp, severity, title, detail, target, evidence}
- activity_log[]: {agent, timestamp, action, result}
```

---

### 3. Explorer Agent
**Source:** `packages/opencode/src/agent/pentest/explorer.md`
**Role:** Interactive exploration and testing. Probes services, tests hypotheses, validates findings.

**Agent-Specific Prompt:**
```text
You are the Explorer specialist. You probe and test discovered services.

Load `web-exploitation` and `ctf-methodology` skills before starting any task.

Rules:
- Work only with targets from Recon findings or engagement scope
- Test one hypothesis at a time
- Document what you tried and what you found
- Flag potential vulnerabilities but do NOT exploit
- Report findings back to Router when complete

After completing any task, append your findings to .opencode/shared-resources/findings.json:
- findings[]: {id, agent, timestamp, severity, title, detail, target, evidence}
- activity_log[]: {agent, timestamp, action, result}
```

---

### 4. Coder Agent
**Source:** `packages/opencode/src/agent/pentest/coder.md`
**Role:** Script writer and automation. Generates payloads, custom tools, exploit scripts.

**Agent-Specific Prompt:**
```text
You are the Coder specialist. You write scripts and automation tools.

Load `ctf-methodology` and `scope-checker` skills before starting any task.

Rules:
- All scripts must respect engagement scope boundaries
- Add comments explaining what each section does
- Include safety checks (target validation, scope check) in every script
- Save scripts to ./scripts/ directory
- Report what you created back to Router when complete

After completing any task, append your findings to .opencode/shared-resources/findings.json:
- findings[]: {id, agent, timestamp, severity, title, detail, target, evidence}
- activity_log[]: {agent, timestamp, action, result}
```

---

### 5. Report Agent
**Source:** `packages/opencode/src/agent/pentest/report.md`
**Role:** Report generator. Summarizes findings, actions taken, and recommendations.

**Agent-Specific Prompt:**
```text
You are the Report specialist. You compile and summarize all pentest activity.

Load `report-format` skill before starting any report.

Rules:
- Read shared findings from all agents
- Structure reports: Executive Summary, Findings, Evidence, Recommendations
- Save reports to ./reports/ directory
- Include severity ratings (Critical, High, Medium, Low, Info)
- Reference which agent discovered each finding
- Report completion back to Router

After completing any task, append your findings to .opencode/shared-resources/findings.json:
- findings[]: {id, agent, timestamp, severity, title, detail, target, evidence}
- activity_log[]: {agent, timestamp, action, result}
```

## Context Injection Mechanisms

The user asked: **"Show me what gets injected into each agent's context (skills, engagement data, findings.json)"**

### 1. Skills (`SkillTool`)
Skills are **not** injected as raw text into the system prompt. Instead, they are exposed to the agent dynamically via the `skill` tool (defined in `src/tool/skill.ts`).
- **Tool Description Injection**: The list of accessible skills (their names and descriptions) is evaluated against the agent's permissions (`PermissionNext.evaluate`) and injected directly into the `skill` tool's descriptions and parameters.
- **On-Demand Loading**: The agent's prompt tells it to "Load [skill-name] skill" before starting a task. The agent then calls the `skill` tool with the requested name. The tool locates the skill's markdown file, parses it, and returns its full content to the agent's context as a tool result message.

### 2. Engagement Data & Findings (`findings.json`)
Like skills, engagement data and finding summaries are **not** automatically injected into the system prompt context. 
- **File System Approach**: OpenCode relies on a shared JSON file (`.opencode/shared-resources/findings.json`) that houses the `engagement` scope, the `findings` array, and the `activity_log`.
- **Instructional Enforcement**: Rather than injecting the data behind the scenes, the Router and sub-agents are given explicit instructions in their system prompts to read and edit this file (e.g., *"Reference .opencode/shared-resources/findings.json before planning next steps"* and *"After completing any task, append your findings..."*).
- **Permission Boundary**: The agents are granted explicit `read` and `edit` file permissions targeted specifically at `.opencode/shared-resources/*` (configured in their agent markdown frontmatter). They use standard filesystem tools (like the `read` or `bash` tools) to actively load the engagement data into their context on demand.

## Agent Output and Consumption Formats

The user asked: **"Show me the output format each agent produces that other agents consume."**

Agents in this system primarily communicate through a shared state (`findings.json`) and structured natural language responses to the orchestrator (Router). 

### 1. The Router (Orchestrator)
The Router consumes the user's initial request and produces a structured plan to be consumed by the **user** (for approval) and to set the context for **sub-agents**.
**Output Format (Plan):**
```text
- What: [brief task description]
- Who: @[agent(s) to dispatch]
- Scope check: ✅ in-scope or ❌ out-of-scope
- "Approve?"
```

### 2. Sub-Agents (Recon, Explorer, Coder, Report)
All sub-agents communicate their actual data and state changes by appending to a shared JSON schema that other agents consume.
**Primary Output Resource (`.opencode/shared-resources/findings.json`):**
```json
{
  "findings": [
    {
      "id": "...",
      "agent": "...",
      "timestamp": "...",
      "severity": "...", 
      "title": "...", 
      "detail": "...", 
      "target": "...", 
      "evidence": "..."
    }
  ],
  "activity_log": [
    {
      "agent": "...",
      "timestamp": "...",
      "action": "...",
      "result": "..."
    }
  ]
}
```

**Specific Artifact Outputs:**
- **Coder Agent**: Produces executable code and payloads saved specifically to the `./scripts/` directory, which can be consumed and executed by the Explorer or Recon agents via `bash`.
- **Report Agent**: Consumes the shared `findings.json` and produces the final human-readable artifacts saved to the `./reports/` directory (structured as Executive Summary, Findings, Evidence, Recommendations).

**Handoffs:**
- Upon completion of their specialized tasks, every sub-agent is instructed to **"Report findings/completion back to Router"**, which is a natural language conversational hand-off mechanism indicating that the `findings.json` state has been updated and the Router should plan the next step based on the new data.

### 3. Model Context Protocol (MCP) Integration
MCP servers are integrated seamlessly into the agent's context through two primary mechanisms (handled in `src/session/prompt.ts`):

**A. MCP Tools (`MCP.tools()`)**
- At the start of a session loop, the system queries connected MCP servers for their available tools.
- These tools are merged dynamically with OpenCode's native tools (like `bash`, `read`, `skill`).
- To the agent, MCP tools look **identical** to native tools. They are injected into the LLM's system prompt as available JSON schemas.
- When an agent calls an MCP tool, the response (which can contain text, images, or raw binary resources) is intercepted by OpenCode, mapped to standard message parts (e.g., base64 data URIs for images), and injected back into the conversation history as a tool result block.

**B. MCP Resources (`MCP.readResource()`)**
- If a user prompt or an agent action references an MCP resource URI (`part.source?.type === "resource"`), the system processes it before sending the prompt to the LLM.
- It actively calls `MCP.readResource(clientName, uri)` to fetch the resource content.
- The content is then injected directly into the LLM's context window as synthetic text messages (e.g., `Reading MCP resource: [filename] ([uri])` followed by the actual text or binary marker).
