# InstallMe — OpenCode MoE Setup Guide

## Prerequisites

Install these first:

1. **Git** — https://git-scm.com/downloads
2. **Bun** — https://bun.sh
   - Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`
   - Mac/Linux: `curl -fsSL https://bun.sh/install | bash`
3. **Ollama** — https://ollama.com/download

## Setup

### 1. Clone the repo
```
git clone https://github.com/YOUR_ORG/opencode-moe.git
cd opencode-moe
```

### 2. Build & Launch

**Windows (PowerShell):**
```powershell
./build.ps1
```

**Mac/Linux:**
```bash
chmod +x build.sh
./build.sh
```

This installs all dependencies, registers `map-dev` as a global command, and starts the TUI.

After build completes, `map-dev` works from any folder — it launches the TUI with that folder as the working directory.

## First Run

- No config files needed — the app creates everything on first launch.
- No API keys required — works with local Ollama models out of the box.
- To add cloud AI providers (Claude, DeepSeek, etc.), the app will prompt you on first use.

## Reset Options

**Clean** — removes local build artifacts:
```
./build.ps1 -Clean        # Windows
./build.sh --clean         # Mac/Linux
```

**Nuke** — full factory reset (keeps your provider configs):
```
./build.ps1 -Nuke         # Windows
./build.sh --nuke          # Mac/Linux
```

## Verify It Works

1. Run `map-dev` or `./build.ps1`
2. TUI launches → you should see the MAP logo
3. Select an Ollama model from the model picker
4. Type a message → get a response

You're in.