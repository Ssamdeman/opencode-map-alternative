import re
import os

files = [
    "packages/opencode/src/agent/prompt/recon.txt",
    "packages/opencode/src/agent/pentest/recon.md",
    "packages/opencode/src/agent/prompt/explorer.txt",
    "packages/opencode/src/agent/pentest/explorer.md",
    "packages/opencode/src/agent/prompt/coder.txt",
    "packages/opencode/src/agent/pentest/coder.md",
    "packages/opencode/src/agent/prompt/report.txt",
    "packages/opencode/src/agent/pentest/report.md"
]

replacement = """**Output:** Append to `.opencode/shared-resources/findings.json`
findings.json schema:
{
  "findings": [
    { "agent": "<your-name>", "ts": "ISO-8601", "sev": "crit|high|med|low|info", "title": "concise 1-line technical summary", "evidence": "relevant tool output snippet" }
  ],
  "lessons": [
    { "agent": "<your-name>", "ts": "ISO-8601", "mistake": "what went wrong technically", "fix": "what to do instead" }
  ]
}

Write rules:
- Append to findings[] as you discover things (not one dump at end)
- Append to lessons[] after each task — what mistake you made, what's the fix
- Keep both findings and lessons to 1-2 lines max, technical essence only
- Use the `write` tool: read → parse → append → write full JSON back
- Never use bash echo/redirect to write JSON
- If the write tool fails, retry once. If it fails again, report the error to Router in your completion message — include the finding data in your response so no data is lost."""

# Regex to match the old block (either "**Output:** Append to..." or "After completing any task, append...")
# down to "If the write tool fails... no data is lost."
pattern = re.compile(r'(?:\*\*Output:\*\* Append to [^\n]+|After completing any task, append your findings to [^\n]+)\n.*?so no data is lost\.', re.DOTALL)

for fpath in files:
    if os.path.exists(fpath):
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Replace the schema and write procedure block entirely
        new_content, count = pattern.subn(replacement, content)
        
        # Also remove mentions of activity_log or engagement
        # e.g., "- Log every action and result to findings.json activity_log"
        new_content = re.sub(r'^[ \t]*-.*activity_log.*\n?', '', new_content, flags=re.MULTILINE)
        
        # Remove any other references to engagement object or activity_log
        
        if count > 0:
            with open(fpath, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"Updated {fpath}")
        else:
            print(f"Pattern matched 0 times in {fpath}")
    else:
        print(f"File not found: {fpath}")
