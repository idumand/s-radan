import re

with open("server.ts", "r") as f:
    text = f.read()

# Fix the dangling closing brace from the removed `if (!isDryRun)`
pattern = r"""\} catch\(e: any\) \{\s*addEngineLog\("WARN", "Mevcut pozisyonlar alınamadı: " \+ e\.message\);\s*\}\s*\}"""
replacement = """} catch(e: any) {
             addEngineLog("WARN", "Mevcut pozisyonlar alınamadı: " + e.message);
        }"""
text = re.sub(pattern, replacement, text)

with open("server.ts", "w") as f:
    f.write(text)
