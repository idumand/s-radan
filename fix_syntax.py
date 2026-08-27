import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = r"exchange = new ExchangeClass\(exOpts\);\s*enableRateLimit: true,\s*options: \{\s*defaultType: \"future\",\s*adjustForTimeDifference: true,\s*\},\s*\}\);"
replacement = "exchange = new ExchangeClass(exOpts);"

text = re.sub(pattern, replacement, text)

with open("server.ts", "w") as f:
    f.write(text)
