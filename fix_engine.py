import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = r"const isLongSignal = \(isOversold && macdBullish && deepBullish\) \|\| \(bbBounceLong && deepBullish\);"
replacement = "const isLongSignal = true; // FORCE ENTRY FOR TEST"

text = re.sub(pattern, replacement, text)

with open("server.ts", "w") as f:
    f.write(text)
