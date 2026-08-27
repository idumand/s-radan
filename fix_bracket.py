import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = r"""addEngineLog\("ERROR", `\[CANLI\] \$\{symbol\} Giriş Emri Reddedildi: \$\{e\.message\}`\);\s*\}"""
replacement = """addEngineLog("ERROR", `[CANLI] ${symbol} Giriş Emri Reddedildi: ${e.message}`);
        }
    }"""
text = re.sub(pattern, replacement, text)

with open("server.ts", "w") as f:
    f.write(text)
