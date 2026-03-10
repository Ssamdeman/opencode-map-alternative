


https://codewiki.google/github.com/google-gemini/gemini-cli --> AI knowlede for the whole code. I can ask anything about the code. 




Here's your 0.0.6 Feature Vision Template with placeholders for the wiki agent answers:

FEATURE CONCEPT: Local Ollama Auto-Detection & Model Discovery
CORE IDEA:
OpenCode auto-detects local Ollama at startup, discovers all available models (local + cloud), and displays them unified in /model with provider tags.

HOW IT WORKS:

App starts → Pings http://localhost:11434/ for local Ollama
If found → Fetches all local models via Ollama API
Combines local models + existing cloud models in unified list
User runs /model → Sees all models with provider tags:

   mistral (Ollama)
   neural-chat (Ollama)
   llama2 (Ollama)
   gpt-4 (Cloud)
   claude (Cloud)

User selects any model → Session uses that model

WIKI AGENT ANSWERED:
About Current Model System:
1. How are models currently stored/registered in OpenCode?
AI models in OpenCode are stored and registered through a multi-layered system, primarily managed by the platform's provider management system and local application contexts.

The platform loads and consolidates configurations for AI models from multiple sources, including a dedicated models database (packages/opencode/src/provider/models.ts), environment variables, user configurations, and various plugins. This is detailed in Model Context Protocol (MCP) and Provider Integrations. The system dynamically loads AI SDKs for specific models, handling both bundled and external SDKs, and provides a unified interface for model discovery, configuration, and instantiation.

Within the web application (packages/app), model management is handled by packages/app/src/context/models.tsx (via ModelsProvider) and packages/app/src/context/local.tsx (via LocalProvider).

The ModelsProvider (packages/app/src/context/models.tsx) manages:

user models: This includes a list of ModelKey (provider ID and model ID) along with user-specific settings like visibility (show/hide) and favorite status.
recent models: A list of recently used ModelKey instances.
variant: Stores selected model variants.
It computes available models by filtering connected providers, identifies latest models based on their release date, and manages visibility of models based on user preferences and whether they are "latest".
The LocalProvider (packages/app/src/context/local.tsx) integrates with the ModelsProvider to manage the currently selected model within a specific project context. It ensures that the selected model is valid (isModelValid function checks if the provider is connected and the model exists) and provides a fallback mechanism if a preferred model is unavailable. It also allows for ephemeral model selections per agent.

Users can manage model visibility and connect to custom providers through the UI:

The DialogManageModels component (packages/app/src/components/dialog-manage-models.tsx) allows users to toggle the visibility of various models.
The DialogCustomProvider component (packages/app/src/components/dialog-custom-provider.tsx) enables users to define and register custom OpenAI-compatible providers by specifying a provider ID, display name, base URL, API key, and the models it offers. These custom provider configurations are stored and managed through the globalSync context (packages/app/src/context/global-sync.tsx), which updates the application's global configuration.
The SettingsModels component (packages/app/src/components/settings-models.tsx) in the application settings also provides an interface for managing model visibility.

2. Where does /model command pull its list from?
The /model command, as represented in the PromptInput component (packages/app/src/components/prompt-input.tsx) and the CommandProvider (packages/app/src/context/command.tsx), pulls its list of available models from the Models context, managed by useModels and local.model.

Specifically:

The useModels hook (packages/app/src/context/models.tsx) provides the list() function, which gives access to all available models. This list is derived from providers.connected() and includes details like model ID, provider, name, and release date. It also incorporates user-defined visibility preferences.
The local.model context (packages/app/src/context/local.tsx), which wraps useModels, manages the current and recent model selections. The local.model.list() accessor returns a list of available models, and local.model.recent.list() provides recently used models.
The system includes a fallback mechanism if a preferred model is unavailable, checking if the provider is connected and the model exists, as described in Model Context Protocol (MCP) and Provider Integrations.
The commands themselves are aggregated and managed by the Command context (packages/app/src/context/command.tsx), which combines built-in commands with user-defined ones and dynamically fetched commands from the MCP, as outlined in Comprehensive Command Management and Templating.

3. How does /connect handle different AI providers (Anthropic, Ollama, etc)?
The /connect command handles different AI providers like Anthropic and Ollama through a robust system of provider management and authentication flows, as described in Model Context Protocol (MCP) and Provider Integrations.

The primary component responsible for connecting providers is DialogConnectProvider in packages/app/src/components/dialog-connect-provider.tsx. This component orchestrates the connection process, which can involve different authentication methods:

Provider Identification and Method Selection:

The DialogConnectProvider receives a provider ID as a prop.
It fetches available authentication methods for that provider from globalSync.data.provider_auth[props.provider]. If no specific methods are defined, it defaults to an "API key" method.
Users can select an authentication method from a list if multiple are available. The component uses selectMethod to handle the chosen method.
API Key-Based Authentication:

If the selected method is of type: "api", the DialogConnectProvider renders a form for the user to input their API key.
For specific providers like OpenCode Zen, it provides tailored instructions.
After the user submits the API key, the handleSubmit function calls globalSDK.client.auth.set to store the API key for the given providerID.
It then calls complete() to dispose of the global SDK client and show a success toast.
OAuth 2.0 Authentication (for remote servers):

If the selected method is of type: "oauth", the process involves an authorization flow.
The selectMethod function initiates the OAuth authorization by calling globalSDK.client.provider.oauth.authorize.
For code-based OAuth (manual code entry):
The application opens an authorization url in the user's browser using platform.openLink.
The user is prompted to enter an authorization code received from the OAuth provider into a TextField.
Upon submission, globalSDK.client.provider.oauth.callback is invoked with the providerID, method index, and the entered code to exchange it for tokens.
For auto-based OAuth (automatic token exchange):
The application opens the authorization url in the browser.
It then automatically calls globalSDK.client.provider.oauth.callback to handle the token exchange, often requiring a confirmation code displayed to the user in a read-only TextField.
The OAuth process manages authentication states (pending, complete, error) and displays appropriate messages and errors.
Custom Providers (e.g., Ollama-compatible services):

The DialogCustomProvider in packages/app/src/components/dialog-custom-provider.tsx allows users to configure OpenAI-compatible providers (which could include local models like Ollama, if they expose an OpenAI-compatible API).
Users can specify a providerID, name, baseURL, apiKey (optional, can be managed via headers), and define custom models and headers.
The validate function ensures that the provided information is correct (e.g., valid URL, unique provider ID).
Upon saving, the configuration is stored in globalSync.data.config.provider and, if an API key is provided, it's set via globalSDK.client.auth.set.
The system also integrates with the AuthHook interface defined in packages/plugin/src/index.ts to allow plugins to introduce custom authentication mechanisms, providing flexibility for various AI services, as detailed in Custom Authentication Mechanisms and Flow Management. The useProviders hook packages/app/src/hooks/use-providers.ts is used across the application to retrieve lists of available and connected providers, including those configured by users
4. What's the data structure for a "model" object?
A "model" object in OpenCode, as defined in packages/app/src/components/model-tooltip.tsx, has the following data structure:

type ModelInfo = {
  id: string;
  name: string;
  provider: {
    name: string;
  };
  capabilities?: {
    reasoning: boolean;
    input: InputMap; // InputMap can contain keys like "text", "image", "audio", "video", "pdf"
  };
  modalities?: {
    input: Array<string>;
  };
  reasoning?: boolean; // Duplicates capabilities.reasoning, but present in some model definitions
  limit: {
    context: number;
  };
};

type InputKey = "text" | "image" | "audio" | "video" | "pdf";
type InputMap = Record<InputKey, boolean>;

This ModelInfo type is used to display details about a model, including its id, name, the name of its provider, and its limit for context. It also contains optional fields such as capabilities and modalities to describe the types of input it can handle (e.g., text, image, audio, video, pdf) and whether it supports reasoning.

This structure is used within the ModelTooltip component to render information about different AI models, allowing the application to present details like supported input types and context limits to the user.

In the application's context management, specifically within packages/app/src/context/local.tsx and packages/app/src/context/models.tsx, models are often identified using a ModelKey type:

export type ModelKey = { providerID: string; modelID: string };

This ModelKey is used for internal tracking of models, including user preferences such as visibility and recent usage, as described in the ModelsProvider within Core SolidJS Web Application (App Package).

5. How does the session know which model is "active"?
The session knows which model is "active" through the ACPSessionManager and the LocalProvider in the UI.

ACP Agent (ACP.Agent): When an ACP session is created or loaded, the ACPSessionManager in packages/opencode/src/acp/session.ts stores the model information within its ACPSessionState. The ACP.Agent in packages/opencode/src/acp/agent.ts uses the defaultModel function to determine an initial model. Subsequently, the unstable_setSessionModel method allows clients to explicitly set the session's active model, which updates the model property of the ACPSessionState.
UI (PromptInput component): In the web application, the PromptInput component in packages/app/src/components/prompt-input.tsx uses the useLocal hook, specifically local.model.current(), to determine the currently active model. This current() function, defined in packages/app/src/context/local.tsx, first checks for an ephemeral model selection for the active agent, then the agent's default model, and finally falls back to a global default model. It ensures the selected model is valid and available from connected providers. Model variants are managed by local.model.variant.current(), also within packages/app/src/context/local.tsx.
Persistence and Fallback: The ModelsProvider in packages/app/src/context/models.tsx manages user model preferences, including recent models and visibility. It also determines the "latest" models. If no specific model is set or available, the system has a fallback mechanism to select a model based on configured defaults or the first available model from connected providers, as detailed in Model Context Protocol (MCP) and Provider Integrations. When a user sends a prompt, the PromptInput component captures the local.model.current() model and local.model.variant.current() variant to be used for that specific prompt request.
6. Is there already an Ollama integration? If so, where's the code?
While there isn't a specific "Ollama" integration explicitly mentioned in the provided context, OpenCode's architecture supports integrating Ollama (or any other local model that exposes an OpenAI-compatible API) through its custom provider mechanism.

The DialogCustomProvider component in packages/app/src/components/dialog-custom-provider.tsx allows users to define and register custom OpenAI-compatible providers. This involves specifying a provider ID, display name, base URL, an optional API key, and custom models and headers. The validate function ensures the provided information is correct, and upon saving, the configuration is stored in globalSync.data.config.provider.

The Zen Service also features openai-compatible.ts in packages/console/app/src/routes/zen/util/provider/openai-compatible.ts which handles request and response transformations for OpenAI-compatible APIs, allowing the platform to interact with such services. For instance, the oaCompatHelper utility in this file provides functions to modify URLs, headers, and bodies for OpenAI-compatible requests, and to normalize usage information. The fromOaCompatibleRequest, toOaCompatibleRequest, fromOaCompatibleResponse, toOaCompatibleResponse, fromOaCompatibleChunk, and toOaCompatibleChunk functions manage the conversion between OpenCode's common request/response/chunk formats and the OpenAI-compatible format.

Additionally, the broader provider management system in packages/opencode/src/provider/provider.ts supports createOpenAICompatible for dynamically loading AI SDKs that are OpenAI-compatible. This modular design allows for flexible integration of new AI models and services, adapting to their unique API requirements and authentication mechanisms, as detailed in Model Context Protocol (MCP) and Provider Integrations.
7. What would need to change to auto-detect local Ollama at startup?
To auto-detect a local Ollama instance at startup, several modifications would be needed across the sst/opencode repository, primarily focusing on the desktop application and the opencode core package's server and provider logic.

Desktop Application (packages/desktop):

Server Connection Setup (setup_server_connection in packages/desktop/src-tauri/src/lib.rs): The setup_server_connection function currently checks for a custom server URL or attempts to start a local opencode server. This logic would need to be extended to:
Check for Running Ollama Instance: Before starting its own sidecar, the desktop application could attempt to detect if an Ollama server is already running on a default port (e.g., 127.0.0.1:11434). This would involve:
Adding a check_ollama_health function similar to check_server_health that pings the Ollama API endpoint (e.g., /api/tags) to verify its health.
Modifying the setup_server_connection flow to prioritize detection of a healthy local Ollama server.
Configure OpenCode to Use Ollama: If a local Ollama is detected, opencode needs to be configured to use it as an OpenAI-compatible provider. This might involve:
Invoking a tauri::command to instruct the opencode CLI to add a custom provider with the Ollama endpoint.
Alternatively, automatically modifying the opencode.settings.dat file (SETTINGS_STORE in packages/desktop/src-tauri/src/lib.rs) to include the Ollama provider configuration.
CLI Integration (packages/desktop/src-tauri/src/cli.rs): The create_command function would need to ensure that the opencode CLI can accept arguments or environment variables to register an Ollama instance, if not handled directly by the setup_server_connection in the backend.
OpenCode Core Package (packages/opencode):

Server (packages/opencode/src/server/server.ts): The Server.listen function in packages/opencode/src/cli/cmd/serve.ts is responsible for starting the opencode server. This server would need to expose an API endpoint or a mechanism to receive a request to register a new provider dynamically.
Provider Management (packages/opencode/src/provider/provider.ts):
The Provider system currently loads configurations from various sources, including plugins and user configurations. A new mechanism for programmatic registration of providers would be beneficial.
The existing createOpenAICompatible function in packages/opencode/src/provider/provider.ts is already designed to handle OpenAI-compatible APIs, which Ollama provides. The auto-detection logic would essentially trigger the creation of such a provider.
Configuration (packages/opencode/src/config/config.ts): The layered configuration system would need to support the dynamic addition of a new Ollama provider configuration at a suitable precedence level (e.g., user-specific or local-instance specific).
Plugin System (packages/opencode/src/plugin): While the DialogCustomProvider in the UI handles user-initiated custom provider setup, a new internal plugin or extension to an existing one could be introduced to encapsulate the logic for Ollama auto-detection and registration. This would involve adding a hook that runs at startup to check for Ollama. The AuthHook mechanism (Custom Authentication Mechanisms and Flow Management) could potentially be extended to define the authentication (or lack thereof for local Ollama) for the auto-detected instance.
Web Application (packages/app):

Global Synchronization (packages/app/src/context/global-sync.tsx): The globalSync context, which manages global configurations, would need to be updated to reflect the presence of the auto-detected Ollama provider. This is where globalSync.data.config.provider would be modified.
Provider UI (packages/app/src/components/dialog-select-provider.tsx, packages/app/src/components/dialog-custom-provider.tsx): The UI components for managing providers would automatically show the auto-detected Ollama instance once it's registered in the global configuration, leveraging existing display logic.
In summary, the key changes would involve adding a detection routine in the desktop application's Rust backend (packages/desktop/src-tauri/src/lib.rs) at startup, and then programmatically instructing the opencode core (packages/opencode) to register this detected Ollama instance as an OpenAI-compatible provider
8. Are there any constraints/guardrails I should know about?
The OpenCode AI platform incorporates several constraints and guardrails to ensure stable operation, maintain code quality, and manage sensitive data and user interactions.

1. Repository Automation and Development Practices:

Commit Guidelines: Strict protocols for Git commit and push operations are enforced, including specific prefixes for commit messages (e.g., docs:, tui:, core:) and a policy requiring reporting merge conflicts rather than resolving them independently, as detailed in Git and Code Quality Commands via .opencode/command/commit.md.
Code Quality Enforcement: Automated checks remove "AI generated slop" (excessive comments, unnecessary defensive programming, incorrect type casts, stylistic inconsistencies, irrelevant emoji usage), outlined in Git and Code Quality Commands through .opencode/command/rmslop.md. Spell-checking on unstaged Markdown files is also performed, focusing on modified lines, as seen in .opencode/command/spellcheck.md.
Pull Request Standards: pull_request_template.md (.github/pull_request_template.md) standardizes PR submissions, requiring descriptive, human-generated changes and verification steps to maintain quality and prevent AI-generated content.
Duplicate PR Detection: An AI agent detects duplicate pull requests using github-pr-search (configured in .opencode/agent/duplicate-pr.md), ensuring consistency across contributions.
2. Infrastructure and Deployment:

Secrets Management: Sensitive data like API keys and credentials are managed using sst.Secret instances, centralized in infra/secret.ts, and securely injected at deployment, preventing hardcoding and integrating with external secret management systems, as described in Secrets Management and Stage-Specific Configuration.
Stage-Specific Configuration: Dynamic configuration of domain names and Cloudflare zones based on deployment stages (e.g., production, dev) ensures environments are correctly provisioned and isolated, also detailed in Secrets Management and Stage-Specific Configuration via infra/stage.ts.
3. AI Agent Configuration and Operations:

Agent Permissions: AI agents operate within defined security boundaries using explicit permission rules, which leverage bash command analysis for granular control, as covered in Advanced AI Agent Definition and Dynamic Generation and Advanced Interaction Management: Permissions, PTY, and Questions via packages/opencode/src/permission/index.ts, packages/opencode/src/permission/next.ts, and packages/opencode/src/permission/arity.ts. This allows for automatic allowance/denial or user prompting for actions outside predefined policies.
Prompt Templates: Agent behavior is guided by prompt templates (e.g., packages/opencode/src/agent/prompt/compaction.txt, packages/opencode/src/agent/prompt/explore.txt) that enforce specific outputs, formats, and tool usage rules, ensuring consistency and quality in AI responses, as discussed in Advanced AI Agent Definition and Dynamic Generation.
Model Restrictions: Experimental and deprecated models are filtered out, and model blacklists/whitelists configured by users or administrators are respected, preventing unintended model usage. This is managed within packages/opencode/src/provider/provider.ts.
Tool Usage Control: AI agents have restricted tool access, explicitly defined in their configurations (e.g., the duplicate PR detection agent explicitly allows only github-pr-search and disallows * (all other tools) in .opencode/agent/duplicate-pr.md), as seen in AI Agent Definitions and Behaviors.
4. Performance Optimization Strategies:

Payload Limits: Large data (e.g., images, terminal buffers) is handled with payload limits and dedicated blob storage to prevent main thread blocking and excessive storage, as described in Performance Optimization Strategies and specs/01-persist-payload-limits.md.
Cache Eviction: A shared LRU/TTL cache utility prevents unbounded memory growth in in-memory caches (file contents, session messages), ensuring efficient memory usage, as detailed in Performance Optimization Strategies and specs/02-cache-eviction.md.
Request Throttling: Debouncing and latest-only strategies are applied to high-frequency server calls (e.g., file search, LSP refreshes) to reduce redundant load and ensure UI responsiveness, documented in Performance Optimization Strategies and specs/03-request-throttling.md.

DATA FLOW:
App startup
    ↓
Ping localhost:11434
    ↓
If Ollama found → Fetch /api/tags
    ↓
Parse models + add "Ollama" provider tag
    ↓
Merge with existing cloud model list
    ↓
Store in session state
    ↓
/model command displays unified list

WHAT CHANGES:

Ollama service handler (auto-detect + fetch models)
Model registry (add Ollama models to existing list)
UI display (show provider tags)
Session state (tracks which model is active)



02/08/2026:
**ANALYSIS REPORT: MULTI-MODEL ORCHESTRATION**

**Status:** Complete
**Feature:** Transparent Data Flow Analysis

**Observation**
You observed 3 distinct LLM calls for a single user message "who are you?".

1. `gpt-5-nano` (Title Generator)
2. `kimi-k2.5-free` (Primary Response)
3. `gpt-5-nano` (Summarizer)

**Architectural Root Cause**
OpenCode employs a **"Sidecar Agent" pattern**. The system decouples metadata maintenance from the primary conversational flow to optimize for latency and cost. The main "thinking" process triggers asynchronous background workers that utilize lightweight "Utility Models".

**Detailed Flow Analysis**

1. **The Primary Thread (Blocking)**
* **Agent:** `User Selected` (e.g., `kimi-k2.5-free`)
* **Task:** The actual conversation.
* **Action:** Receives user input, executes tools, and streams the response to the UI. This is the only "blocking" call the user waits for.


2. **The Title Worker (Async / Background)**
* **Agent:** `title` (Hardcoded to `gpt-5-nano` in `src/agent/agent.ts`)
* **Trigger:** Detects if `session.title` is generic or empty on the first turn.
* **Purpose:** Generates a semantic filename/title for the session list (e.g., "Identity Inquiry" instead of "Session 1").
* **Why:** Runs separately so the user doesn't wait for a title before seeing the answer.


3. **The Summary Worker (Async / Background)**
* **Agent:** `summary` (Hardcoded to `gpt-5-nano` in `src/agent/agent.ts`)
* **Trigger:** Post-response event.
* **Purpose:** Generates a rolling summary of the conversation context. This is used for **Context Compaction**. When a conversation gets too long, the system drops old messages but keeps this AI-generated summary to preserve "memory" without blowing up the token window.



**Code References**

* **Agent Definitions:** `packages/opencode/src/agent/agent.ts` defines the `title` and `summary` agents as hidden, native agents.
* **Summarization Logic:** `packages/opencode/src/session/summary.ts` handles the `SessionSummary.summarize` logic, processing messages to create the compressed state.

**Conclusion**
The system is working as designed. It uses a "Split-Brain" architecture:

* **High IQ / High Cost Model** (Kimi) for the hard work.
* **Low IQ / Low Cost Model** (GPT-5 Nano) for administrative housekeeping.

the the tool it self can do the job of title and summary generation. also the dual-brain. we can make seperate tasks. 



FEATURE CONCEPT: Session-Scoped Prompt Editor (/prompts)

CORE IDEA
Allow users to view, edit, and override system prompts for their current session, enabling real-time prompt experimentation without modifying source files.

HOW IT WORKS
User Journey:
1. User types /prompts

Dialog opens showing all active prompts for current session
Lists prompts being sent to AI models

2. Dialog displays prompt inventory:
   ┌─ SESSION PROMPTS ────────────────────────────┐
   │                                               │
   │ [TITLE GENERATOR]                             │
   │ Model: gpt-5-nano                             │
   │ Source: src/agent/prompt/title.txt            │
   │ Status: ● DEFAULT                             │
   │ Preview: "You are a title generator..."       │
   │ [View] [Edit] [Reset]                         │
   │                                               │
   │ [MAIN ASSISTANT]                              │
   │ Model: kimi-k2.5-free (selected)              │
   │ Source: src/session/prompt/beast.txt          │
   │ Status: ● DEFAULT                             │
   │ Preview: "You are opencode, an interactive..." │
   │ [View] [Edit] [Reset]                         │
   │                                               │
   │ [INSTRUCTION CONTEXT]                         │
   │ Source: AGENTS.md                             │
   │ Status: ● DEFAULT                             │
   │ Preview: "# opencode agent guidelines..."     │
   │ [View] [Edit] [Reset]                         │
   │                                               │
   └───────────────────────────────────────────────┘
3. User clicks [Edit] on any prompt:

Full-screen text editor opens
Shows complete prompt content
User modifies text
Click [Save] → stores override in session cache

4. Override applied:

Next AI request checks SessionPromptCache
If override exists → use custom prompt
If no override → load from .txt file
Transparent logger shows custom prompt was sent

5. Session ends:

SessionPromptCache auto-clears
Next session starts fresh with defaults
No persistence across sessions


DATA FLOW
User Message Input
  ↓
buildRequestParts() (existing)
  ↓
SystemPrompt.get(sessionID, promptType) ← NEW CHECK
  ↓
  ├─ Check SessionPromptCache.get(sessionID, promptType)
  │   ├─ If override exists → return custom prompt
  │   └─ If no override → load from .txt file (existing)
  ↓
AI Request Payload (with prompt)
  ↓
Send to Model
  ↓
Transparent Logger captures (already works)

WHAT CHANGES
New Files:
1. /src/session/prompt-cache.ts
typescript// Session-scoped prompt override storage
namespace SessionPromptCache {
  type PromptType = "title" | "assistant" | "instruction"
  
  const cache = createScopedCache<{
    sessionID: string
    promptType: PromptType
    customPrompt: string
  }>({
    maxEntries: 100, // Max 100 sessions
    ttlMs: 1000 * 60 * 60 * 4 // 4 hours
  })
  
  export function set(sessionID: string, type: PromptType, prompt: string)
  export function get(sessionID: string, type: PromptType): string | null
  export function clear(sessionID: string, type?: PromptType)
  export function isOverridden(sessionID: string, type: PromptType): boolean
}
2. /src/session/prompt-editor.ts
typescript// Slash command handler
namespace PromptEditor {
  export const command = SlashCommand.define({
    name: "prompts",
    aliases: ["prompt", "systemprompt"],
    description: "View and edit session prompts",
    
    execute: async (ctx) => {
      const prompts = await getSessionPrompts(ctx.sessionID)
      return Dialog.open({
        title: "Session Prompts",
        content: <PromptEditorDialog prompts={prompts} />
      })
    }
  })
}
3. /src/ui/dialog/prompt-editor.tsx
typescript// UI component for prompt editing
function PromptEditorDialog(props: { prompts: PromptInfo[] }) {
  // Reuse existing dialog components
  // Text editor with save/reset/cancel
}

Modified Files:
1. /src/session/system.ts (SystemPrompt namespace)
typescript// BEFORE:
export function get(model: string): string {
  return Bun.file(`./src/session/prompt/${model}.txt`).text()
}

// AFTER:
export function get(sessionID: string, model: string, type: PromptType): string {
  // Check for session override first
  const override = SessionPromptCache.get(sessionID, type)
  if (override) return override
  
  // Fall back to file-based prompt
  return Bun.file(`./src/session/prompt/${model}.txt`).text()
}
2. /src/acp/agent.ts (where AI requests are built)
typescript// When building system prompt for AI request:
const systemPrompt = SystemPrompt.get(
  sessionID,
  model.modelID,
  "assistant" // or "title", "instruction"
)
3. Session cleanup (wherever sessions are destroyed)
typescriptSession.onDestroy((sessionID) => {
  SessionPromptCache.clear(sessionID) // Clean up overrides
})
```

---

## ARCHITECTURE DECISIONS

### **1. Storage Strategy:**
- Use `createScopedCache` (existing utility)
- Automatic TTL-based cleanup (4 hours)
- Session ID scoped (not global)
- Clears on session destroy

### **2. Prompt Discovery:**
Three prompt sources identified from your transparent log:
```
1. Title Generator    → src/agent/prompt/title.txt
2. Main Assistant     → src/session/prompt/beast.txt (or model-specific)
3. Instructions       → AGENTS.md (loaded by InstructionPrompt)
3. Override Injection Point:
Modify SystemPrompt.get() to check cache before loading files:
typescriptSessionPromptCache → (if exists) → return custom
       ↓ (if not)
Load from .txt file → return default
```

### **4. UI Pattern:**
- Reuse existing `Dialog` component
- Text editor with syntax highlighting (markdown)
- Show diff indicator: `● DEFAULT` vs `● CUSTOM`
- Reset button restores original

---

## START SIMPLE

### **Phase 1: Read-Only Viewer** (v0.0.8)
```
✓ /prompts command shows current prompts
✓ View full prompt content
✓ Identify which prompts are active
✗ No editing yet
```

### **Phase 2: Session Editing** (v0.0.9)
```
✓ Edit button opens text editor
✓ Save applies to current session
✓ SessionPromptCache storage
✓ Transparent logger shows custom prompts
✓ Reset button clears override
```

### **Phase 3: Advanced Features** (v0.1.0)
```
✓ Export/import custom prompts
✓ Diff view (default vs custom)
✓ Template variables {{sessionID}}, {{date}}
✓ Prompt history/versioning

⚠️ File-Based Prompt Loading:
typescript// Current pattern (from wiki):
Bun.file('./src/session/prompt/title.txt').text()


⚠️ Session Lifecycle Integration:
typescript// Where does session cleanup happen?
// Need to hook into Session.destroy() or equivalent
// to call SessionPromptCache.clear(sessionID)

READY FOR AGENT
This feature needs:

✅ Clear data flow mapped
✅ Storage strategy defined (createScopedCache)
✅ Injection points identified (SystemPrompt.get)
✅ UI components scoped (existing Dialog)
⚠️ Need to verify prompt-to-file mapping
⚠️ Need to locate session cleanup hooks





# OpenCode — Prompt Assembly Pipeline

## Overview

Every LLM call in OpenCode receives a single system message assembled from three layers. Custom session prompts replace only Layer 1; Layers 2 and 3 are always appended.

---

## Assembly Order

```
┌─────────────────────────────────────────────────┐
│  LAYER 1: Base System Prompt                    │
│  (replaceable via /prompts editor)              │
│                                                 │
│  Priority:                                      │
│    1. Agent-specific prompt  (highest)          │
│    2. Session cache override                    │
│    3. Default .txt file      (fallback)         │
└──────────────────┬──────────────────────────────┘
                   │ + "\n"
┌──────────────────▼──────────────────────────────┐
│  LAYER 2: Environment Block                     │
│  (always appended, not editable)                │
│                                                 │
│  • "You are powered by model {modelID}..."      │
│  • <env> working dir, platform, date, git </env>│
│  • <files> project file tree </files>           │
└──────────────────┬──────────────────────────────┘
                   │ + "\n"
┌──────────────────▼──────────────────────────────┐
│  LAYER 3: Project Instructions                  │
│  (always appended, not editable)                │
│                                                 │
│  • AGENTS.md content                            │
│  • CLAUDE.md content (if present)               │
│  • Any other instruction files found            │
│  • Each prefixed: "Instructions from: {path}"   │
└─────────────────────────────────────────────────┘
```

---

## Layer 1: Base Prompt Selection

### Default Routing (system.ts → SystemPrompt.provider())

| Model ID contains | Prompt file loaded     | Cache key        |
|-------------------|------------------------|------------------|
| `gpt-5`           | `codex_header.txt`     | `system:codex`   |
| `gpt-` / `o1` / `o3` | `beast.txt`        | `system:beast`   |
| `gemini-`         | `gemini.txt`           | `system:gemini`  |
| `claude`          | `anthropic.txt`        | `system:anthropic`|
| everything else   | `qwen.txt`             | `system:qwen`    |

### Override Priority (llm.ts lines 71–103)

```
if agent has own prompt       → use agent prompt
else if SessionPromptCache    → use cached override
else if codex model           → use [] (empty)
else                          → use SystemPrompt.provider()
```

### Session Override Flow

```
TUI /prompts dialog
  → user edits prompt
  → POST /session/:id/prompt  (HTTP to server)
  → server writes to SessionPromptCache (same instance as llm.ts)
  → llm.ts reads cache on next LLM call
  → customPrompt: true logged in transparent output
```

---

## Layer 2: Environment Block

Assembled in `prompt.ts`. Always appended after Layer 1.

```
You are powered by the model named {model.name}. The exact model ID is {provider}/{modelID}
<env>
  Working directory: {cwd}
  Is directory a git repo: {yes/no}
  Platform: {win32/darwin/linux}
  Today's date: {date}
</env>
<files>
  {project file tree}
</files>
```

---

## Layer 3: Project Instructions

Assembled in `prompt.ts`. Always appended after Layer 2.

Scans for instruction files (AGENTS.md, CLAUDE.md, etc.) and appends each:

```
Instructions from: {absolute_file_path}
{file content}
```

---

## Key Files

| File | Role |
|------|------|
| `session/system.ts` | Routes model ID → default .txt file |
| `session/prompt.ts` | Assembles all three layers into final system message |
| `session/prompt-cache.ts` | In-memory cache for session overrides (4hr TTL) |
| `session/prompt-info.ts` | Aggregates prompt sources for /prompts display |
| `session/llm.ts` | Checks cache override before default; sends to LLM |
| `server/server.ts` | Hosts POST endpoint for TUI → server cache sync |
| `cli/cmd/tui/component/dialog-prompts.tsx` | TUI editor UI |

---

## Session Scoping Rules

- Custom prompts are **session-scoped** — new sessions always use defaults
- Cache entries expire after **4 hours** TTL
- Cache is cleared when session is deleted (`Session.remove()`)
- TUI and LLM server share cache via HTTP POST (thread isolation bridge)
- `customPrompt: true/false` flag in transparent log confirms which path was used

---

## What Custom Prompts Replace vs. Keep

| Component | Replaced by custom? |
|-----------|---------------------|
| Base system prompt (.txt content) | ✅ Yes |
| Model name / ID line | ❌ Always appended |
| `<env>` block | ❌ Always appended |
| `<files>` tree | ❌ Always appended |
| AGENTS.md instructions | ❌ Always appended |






--------------------------------------------------------------------------------------------------------------------------

Yes, you are exactly right about how it works conceptually! Here is the breakdown of **how**, **when**, and **where** it is saved based on the implementation:

### 1. Does the sub-agent have history, so they don't start from zero?
**Yes.** The [ShellSession](cci:2://file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/shell/shell-session.ts:7:0-161:1) implementation (in [shell-session.ts](cci:7://file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/shell/shell-session.ts:0:0-0:0)) creates a persistent "in-memory" background terminal process (`powershell.exe` on Windows, `bash` or `zsh` on Unix) for each unique session ID. 
- Because this actual terminal process is kept alive behind the scenes, it maintains the state. 
- The result is that if an agent runs `cd some_folder` or sets an environment variable like `export $FOO="bar"`, the terminal remembers it for the next command they execute. They don't have to start from scratch every time!

### 2. When is it saved?
There are two different types of "saving" happening here:
* **The Terminal State (In-Memory)**: The actual background shell process just lives in your computer's memory while OpenCode is currently running. If you restart the specific OpenCode application process, the active live terminals are terminated and the underlying shell state (like current working directory) restarts.
* **The Outputs and History (Persistent)**: Even though the live terminal might die on a restart, the actual commands the agent ran and the **outputs** they produced are saved to the session's overall history continuously immediately after every command is executed. 

### 3. Where are the sessions saved?
All session data is persisted locally as **JSON files**. The [Session](cci:2://file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/shell/shell-session.ts:7:0-161:1) and `Storage` managers (in [session/index.ts](cci:7://file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/session/index.ts:0:0-0:0) and [storage/storage.ts](cci:7://file:///c:/Users/Samue/Documents/projects/github/opencode-map-alternative/packages/opencode/src/storage/storage.ts:0:0-0:0)) handle writing this out. 

Depending on your overall setup, it is saved in your global data folder (usually inside your user directory `.opencode-data/storage` or `.opencode/storage` inside the project).

The storage system organizes everything cleanly like this:
* **Session Metadata:** `storage/session/<project-id>/<session-id>.json`
* **Agent Message History / Outputs:** `storage/message/<session-id>/<message-id>.json`

So, in summary: the fast, context-aware shell state is kept alive in memory for speed and isolation, but a permanent hard record of everything the shell spits out is safely written to disk as JSON files inside your storage directory.