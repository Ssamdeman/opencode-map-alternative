# Execution Gap Analysis: Tool Access & Invocation

## 1. What tools does the LLM worker currently have access to?
The tool system currently defines and registers the following native tools (`packages/opencode/src/tool/registry.ts`):

- **Core/Execution Tools**: `BashTool`, `BatchTool` (experimental)
- **File System/Editor Tools**: `ReadTool`, `GlobTool`, `GrepTool`, `EditTool`, `WriteTool`, `ApplyPatchTool`, `LspTool` (experimental)
- **Workflow Tools**: `TaskTool`, `TodoWriteTool`, `TodoReadTool`
- **Network/Web Tools**: `WebFetchTool`, `WebSearchTool`, `CodeSearchTool`
- **Agent/Planning Tools**: `QuestionTool` (client specific), `PlanEnterTool`, `PlanExitTool` (plan mode), `SkillTool`
- **System Tools**: `InvalidTool`

Additionally, custom tools are supported and loaded dynamically from any matched `{tool,tools}/*.{js,ts}` files across workspace directories or through loaded Plugins (`Plugin.list()`).

## 2. Can sub-agents (custom agents like Recon/Explorer) invoke these tools?
**Yes.** Tools are not restricted exclusively to the default assistant.

All agents receive the general registry of tool schemas in their prompt context (via `ToolRegistry.tools()`). However, whether they are actually allowed to *execute* these tools is strictly controlled by the **individual agent's permission ruleset** (`Agent.Info.permission`). For instance, the default `explore` sub-agent defines permissions that explicitly `"allow"` `grep`, `glob`, `list`, `bash`, `webfetch`, `websearch`, `codesearch`, and `read`, but sets `"deny"` for everything else (`"*"`).

If a restricted agent attempts to call a denied tool, the system will immediately block it and feed a permission generic error back to the LLM context.

## 3. How does tool invocation flow?
The chain of execution flows as follows:

1. **LLM Generation**: The active Agent LLM outputs a tool call request matching a registered JSON Schema.
2. **Schema Validation**: The core `packages/opencode/src/tool/tool.ts` runtime catches the invocation and validates the LLM's raw arguments using a `Zod` schema. If invalid, the validation error is fed back to the LLM.
3. **Execution & Permissions**: The specific tool's `execute(args, ctx)` method fires. Inside, tools utilize the `PermissionNext.ask()` mechanism to verify if the active agent is permitted to perform the specific action (e.g., reading a generic file vs reading an `.env` file). 
4. **Action**: The core logic occurs (e.g., spinning up a sub-process shell to run bash commands).
5. **Truncation**: Before returning to the LLM, the output is passed through `Truncate.output()` to safeguard the LLM's limited context window from overly massive buffer responses.
6. **Result to Context**: Finally, a `tool_result` object containing the truncated output and metadata is appended to the message history, resuming the LLM generation loop.

## 4. Is there an approval gate? Does the user confirm before a tool executes?
**Yes, and it is natively built into the permission architecture.**

The `PermissionNext` system (`packages/opencode/src/permission/next.ts`) designates patterns to be `"allow"`, `"deny"`, or `"ask"`. 

Whenever an agent attempts to execute an action mapped to `"ask"`, the execution pauses. The system emits a `permission.asked` bus event, effectively holding the thread until a human user explicitly confirms the authorization payload. The user can reply with `"once"`, `"always"`, or `"reject"`. 
- For pentest pipelines, you can simply map critical capabilities (e.g., `bash`, `edit`) to `"ask"` for the agents, ensuring a firm human-in-the-loop requirement is met before any raw shell exploits run.
- If rejected, the system throws a `RejectedError` or `CorrectedError` with user-feedback, dynamically redirecting the LLM without crashing the session.

## 5. What's the tool registration pattern?
- **Native tools** are hardcoded into the registry `all()` method.
- **Custom / Pentest Tools** can be easily exposed by dropping a TypeScript file conforming to the `ToolDefinition` shape into an `.opencode/tools/` (or similar) project directory. The registry natively globs these structures.

To expose a newly registered tool to a custom agent:
1. Ensure the tool is globally available (e.g. by dropping it in the `tools/` folder).
2. Tweak the specific agent's definition in `.opencode.json` (or system config) to include the new tool's tag in its permission tree. 
   *(e.g., `"permission": { "my_custom_nmap_tool": "allow" }`)*

## 6. Does agent-switching preserve tool access?
**They keep the tool schema knowledge, but they switch execution rights.**

When the Router dispatches work to `Recon`, the LLM drops into `Recon`'s specific persona, prompts, and crucially, its specific `Agent.Info.permission` object. Even though `Recon` will understand how to format a `BashTool` call, if `Recon` was defined to cleanly gather passive recon without shell execution (e.g. `bash: "deny"`), its attempt to run `bash` will be rejected by the system. The tool invocation capability is tightly dynamically scoped to whichever agent currently has "the baton".
