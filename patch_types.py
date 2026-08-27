import re
with open("src/types.ts", "r") as f:
    text = f.read()

text = text.replace(
    "profit_abs: number;",
    "profit_abs: number;\n  target_pct?: number;\n  risk_profile?: string;\n  deep_score?: number;"
)

with open("src/types.ts", "w") as f:
    f.write(text)
