import re

with open("src/data/initialData.ts", "r") as f:
    text = f.read()

# Replace all dry_run in INITIAL_CONFIG_JSON
text = text.replace('"dry_run": true', '"dry_run": false')
text = text.replace('dry_run_wallet: 10000', '')
text = text.replace('"dry_run_wallet": 10000', '')

with open("src/data/initialData.ts", "w") as f:
    f.write(text)
