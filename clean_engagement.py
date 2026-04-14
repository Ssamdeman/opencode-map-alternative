import re
import os
import glob

# Search in both .txt and .md files under src/agent/
files = glob.glob("packages/opencode/src/agent/**/*.txt", recursive=True) + \
        glob.glob("packages/opencode/src/agent/**/*.md", recursive=True)

for fpath in files:
    with open(fpath, "r", encoding="utf-8") as f:
        content = f.read()

    new_content = content
    # Remove `(read from `findings.json`)` after engagement scope since the engagement object isn't there
    new_content = re.sub(r'\(read from `?findings\.json`?\)', '', new_content)
    # Just in case there are direct mentions of `engagement` object
    new_content = re.sub(r'engagement object', '', new_content)
    
    if new_content != content:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Cleaned engagement mentions in {fpath}")
