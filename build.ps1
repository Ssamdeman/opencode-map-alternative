<#
.SYNOPSIS
    Builds and starts the OpenCode TUI environment.
.DESCRIPTION
    Installs dependencies, optionally cleans local data, and launches the TUI.
    
    -Clean: Removes local .opencode data and build artifacts for a fresh project state.
    -Nuke:  FULL RESET - Wipes ALL accumulated user data (favorites, recent models, 
            API keys, sessions, caches) but PRESERVES config files (Ollama/provider settings).
.PARAMETER Clean
    Removes local .opencode directory and build artifacts (dist folders).
.PARAMETER Nuke
    Full reset: Removes all local AND global accumulated data including API keys, 
    favorites, recent models, and session history. Preserves config files.
#>
param (
    [switch]$Clean,
    [switch]$Nuke
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n--> $Message" -ForegroundColor Cyan
}

# 1. CLEANUP (Ghost Data & Cache)
if ($Clean) {
    Write-Step "Cleaning local data and build artifacts..."

    $targets = @(
        ".opencode",              # Local session data/config
        "dist",                   # Root build artifacts
        "packages/opencode/dist", # CLI specific build artifacts
        "packages/app/dist"       # Web specific build artifacts
    )

    foreach ($target in $targets) {
        if (Test-Path $target) {
            Write-Host "  Removing $target..." -ForegroundColor Gray
            Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Optional: Clean global cache if you really want a 100% fresh brain
    # Uncomment if you want to wipe global settings too
    # $globalConfig = "$env:USERPROFILE/.opencode"
    # if (Test-Path $globalConfig) { Remove-Item $globalConfig -Recurse -Force }

    Write-Host "  Cleanup complete." -ForegroundColor Green
}

# 1.5. NUKE (Full Reset - Wipe All Accumulated Data)
# This brings the application back to a clean "first launch" state.
# Cleans: favorites, recent models, API keys, sessions, caches
# Preserves: config files (including local Ollama integration settings)
if ($Nuke) {
    Write-Step "NUKING ALL ACCUMULATED DATA (Global & Local)..."
    Write-Host "  This will reset: favorites, recent models, API keys, sessions" -ForegroundColor Yellow
    Write-Host "  Preserved: config files (Ollama/provider settings)" -ForegroundColor Green
    
    # 1. Run standard clean first (local project data + build artifacts)
    $localTargets = @(
        ".opencode",              # Local session data/config
        "dist",                   # Root build artifacts
        "packages/opencode/dist", # CLI specific build artifacts
        "packages/app/dist"       # Web specific build artifacts
    )

    foreach ($target in $localTargets) {
        if (Test-Path $target) {
            Write-Host "  Removing $target..." -ForegroundColor Gray
            Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # 2. Delete Global Home Directory Config (legacy)
    $globalConfig = "$env:USERPROFILE/.opencode"
    if (Test-Path $globalConfig) { 
        Write-Host "  Removing legacy global config: $globalConfig ..." -ForegroundColor DarkYellow
        Remove-Item $globalConfig -Recurse -Force 
    }

    # The xdg-basedir package on Windows creates a .local folder structure in USERPROFILE
    # similar to Linux: ~/.local/state, ~/.local/share, ~/.cache

    # 3. Delete XDG State Directory (contains model.json with favorites/recent, kv.json, prompt-history)
    # Location: $USERPROFILE\.local\state\opencode
    $xdgState = "$env:USERPROFILE\.local\state\opencode"
    if (Test-Path $xdgState) {
        Write-Host "  Removing XDG state (favorites, recent models): $xdgState ..." -ForegroundColor Red
        Remove-Item $xdgState -Recurse -Force -ErrorAction SilentlyContinue
    }

    # 4. Delete XDG Data Directory (contains auth.json, storage, sessions, logs, snapshots)
    # Location: $USERPROFILE\.local\share\opencode
    $xdgData = "$env:USERPROFILE\.local\share\opencode"
    if (Test-Path $xdgData) {
        Write-Host "  Removing XDG data (auth keys, sessions, storage): $xdgData ..." -ForegroundColor Red
        Remove-Item $xdgData -Recurse -Force -ErrorAction SilentlyContinue
    }

    # 5. Delete XDG Cache Directory (model definitions cache, LSP servers, node_modules)
    # Location: $USERPROFILE\.cache\opencode
    $xdgCache = "$env:USERPROFILE\.cache\opencode"
    if (Test-Path $xdgCache) {
        Write-Host "  Removing XDG cache (model definitions, LSP): $xdgCache ..." -ForegroundColor Red
        Remove-Item $xdgCache -Recurse -Force -ErrorAction SilentlyContinue
    }

    # NOTE: We intentionally DO NOT delete XDG Config ($USERPROFILE\.config\opencode)
    # This preserves user's opencode.json config including Ollama provider settings, agents, etc.
    Write-Host ""
    Write-Host "  [!] Config preserved at ~/.config/opencode (provider/Ollama settings intact)" -ForegroundColor Cyan
    Write-Host "  Nuke complete. All accumulated data wiped. Start fresh!" -ForegroundColor Green
}

# 2. DEPENDENCIES
Write-Step "Checking dependencies..."
if (-not (Get-Command "bun" -ErrorAction SilentlyContinue)) {
    Write-Error "Bun is not installed. Please run: powershell -c 'irm bun.sh/install.ps1 | iex'"
}

Write-Step "Installing packages..."
bun install

# 3. BUILD & START
Write-Step "Starting OpenCode TUI (Dev Mode)..."

# This runs the TUI directly from source
# If 'bun dev' in root doesn't target the TUI specifically, we target the CLI package directly
try {
    # Attempting root dev script first
    bun dev
}
catch {
    Write-Warning "Root 'dev' script failed or missing. Attempting direct CLI launch..."
    # Fallback: Run the CLI package dev script directly
    Set-Location "packages/opencode"
    bun dev
}