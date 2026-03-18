# setup-kali-mcp.ps1
# Sets up MCP Kali Server inside WSL from the repo's mcps/ folder
# Run from: opencode-map-alternative/ root

$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
if (-not $repoRoot) { $repoRoot = Get-Location }
$mcpSource = "$repoRoot\mcps\MCP-Kali-Server"

# --- Validate ---
if (-not (Test-Path $mcpSource)) {
    Write-Error "MCP-Kali-Server not found at $mcpSource"
    exit 1
}

# Check WSL is available
$wslCheck = wsl --list --quiet 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "WSL is not installed. Run: wsl --install"
    exit 1
}

Write-Host "[1/4] Converting Windows path to WSL path..." -ForegroundColor Cyan
$wslPath = wsl wslpath -a ($mcpSource -replace '\\', '/')
Write-Host "       WSL sees repo at: $wslPath"

Write-Host "[2/4] Installing Python3 + venv if missing..." -ForegroundColor Cyan
wsl bash -c "sudo apt-get update -qq && sudo apt-get install -y -qq python3 python3-venv python3-pip nmap gobuster nikto dirb enum4linux hydra john sqlmap 2>/dev/null"

Write-Host "[3/4] Creating venv and installing deps..." -ForegroundColor Cyan
wsl bash -c "cd '$wslPath' && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt --quiet"

Write-Host "[4/4] Testing server starts..." -ForegroundColor Cyan
# Start server in background, wait 3 seconds, health check, then kill
wsl bash -c @"
cd '$wslPath'
source .venv/bin/activate
python3 server.py --port 5000 &
SERVER_PID=\`$!
sleep 3
HEALTH=\`$(curl -s http://127.0.0.1:5000/health 2>/dev/null)
kill \`$SERVER_PID 2>/dev/null
if echo "\`$HEALTH" | grep -q 'healthy'; then
    echo 'HEALTH CHECK: PASSED'
else
    echo 'HEALTH CHECK: FAILED'
    echo "\`$HEALTH"
fi
"@

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "To START the server:" -ForegroundColor Yellow
Write-Host "  wsl bash -c `"cd '$wslPath' && source .venv/bin/activate && python3 server.py --port 5000`""
Write-Host ""
Write-Host "To TEST from Windows:" -ForegroundColor Yellow
Write-Host "  curl http://127.0.0.1:5000/health"
Write-Host ""
Write-Host "WSL path for OpenCode MCP config:" -ForegroundColor Yellow
Write-Host "  Client: $wslPath/.venv/bin/python3"
Write-Host "  Args:   $wslPath/client.py --server http://127.0.0.1:5000"