Transparent Data Flow Logger - Implementation Walkthrough
Summary
Implemented a transparent logging system that captures raw AI I/O data for debugging and inspection purposes. Data is tied to session lifecycle and automatically deleted when sessions are removed.

Changes Made
Core Module
[NEW] 
transparent.ts
Transparent.logEntry() - Logs request/response entries to session-specific JSON files
Transparent.get() - Retrieves all entries for a session
Transparent.clear() - Deletes log file when session is removed
Transparent.exists() - Checks if log data exists
LLM Integration
[MODIFY] 
llm.ts
Added Transparent.logEntry() call before streamText() to capture outbound request payload
Session Lifecycle
[MODIFY] 
index.ts
Added Transparent.clear() in Session.remove() for automatic cleanup
UI Components
[NEW] 
dialog-transparent.tsx
Session ID displayed in header
Entry list with timestamps
Click to expand JSON details
Slash Command
[MODIFY] 
routes/session/index.tsx
Registered /transparent command with aliases /io and /raw
Usage
Send a message to generate AI communication
Use /transparent (or /io, /raw) to view raw I/O logs
Click entries to expand full JSON data
Logs auto-delete when session is removed
Storage Location
Logs are stored at: ~/.local/share/opencode/transparent/{sessionID}.json