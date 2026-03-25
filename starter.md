Terminal 1:
wsl bash -c "cd /mnt/c/Users/Samue/Documents/projects/github/opencode-map-alternative/mcps/MCP-Kali-Server && source .venv/bin/activate && python3 server.py --port 5000"


Terminal 2:
wsl bash -c "cd /mnt/c/Users/Samue/Documents/projects/github/opencode-map-alternative/mcps/MCP-Kali-Server && source .venv/bin/activate && python3 client.py --server http://127.0.0.1:5000"



opencode.json:

{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "kali-pentest": {
      "type": "remote",
      "url": "http://127.0.0.1:8000/sse",
      "enabled": true
    }
  }
}