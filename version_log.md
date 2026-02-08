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



