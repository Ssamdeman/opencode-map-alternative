<#
.SYNOPSIS
    Builds and starts the OpenCode TUI environment.
.DESCRIPTION
    Installs dependencies, cleans "ghost" data if requested, and launches the TUI.
.PARAMETER Clean
    If set, deletes local .opencode data, cache, and dist folders to ensure a fresh start.
#>
param (
    [switch]$Clean
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