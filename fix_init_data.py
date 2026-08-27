import re

with open("src/data/initialData.ts", "r") as f:
    text = f.read()

text = text.replace("dry_run: true", "dry_run: false")

with open("src/data/initialData.ts", "w") as f:
    f.write(text)
