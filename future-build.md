## Multi-Terminal Agent Architecture (Abstract)

**Concept:** Each sub-agent gets an isolated execution sandbox — its own terminal process. Agents run, observe, iterate, and only report to Router when they have something meaningful.

### Mental Model

```
Router (no terminal)
  ├── Recon    → Terminal 1 (own shell, own state)
  ├── Explorer → Terminal 2
  ├── Coder    → Terminal 3
  └── Report   (no terminal — reads only)
```

### How It Works

1. **Router dispatches** → system spawns a sandboxed shell for that agent
2. **Agent runs freely** in its shell — multiple commands, reads output, retries, self-corrects
3. **Agent decides** when it has enough → writes to findings.json → signals Router
4. **Router reads findings** → dispatches next agent or asks user

### What This Unlocks

- **Self-correction loops** — agent runs nmap, reads output, adjusts flags, runs again. No human in the loop for iteration
- **Parallel execution** — Recon scans while Coder writes scripts simultaneously
- **Interactive commands work** — SSH, python shells, anything. Each terminal is independent
- **TUI stays clean** — main TUI shows Router + status. Agent terminals are background processes

### Key Design Questions (For Later)

- How does an agent's terminal output feed back into its LLM context?
- Approval gate: per-terminal or centralized?
- Process lifecycle: who kills a hung agent terminal?
- TUI display: tabs? split panes? hidden until user inspects?

### Builds On

- OpenCode's existing BashTool (wraps it, doesn't replace it)
- The permission system (still enforced per-agent)
- findings.json contract (unchanged — that's the communication bus)

---
