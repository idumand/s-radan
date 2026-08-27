import os
import re

# 1. SERVER.TS
with open("server.ts", "r") as f:
    server_code = f.read()

# Remove isDryRun state variable
server_code = re.sub(r"let isDryRun = true;\n", "", server_code)

# Remove dry_run assignment from config
server_code = re.sub(r"isDryRun = conf\?\.dry_run !== false;\n", "", server_code)

# Force API Key check
pattern_api_check = r"""if \(\!apiKey \|\| \!secret\) \{\s*addEngineLog\("WARN", "API Key eksik\. Public market verisi ile çalışacak\."\);\s*\}"""
replacement_api_check = """if (!apiKey || !secret) {
      addEngineLog("ERROR", "API Key veya Secret eksik! GERÇEK PARA İLE İŞLEM YAPILAMAZ. Motor durduruldu.");
      botState = "stopped";
      return { success: false, message: "API Keys missing" };
    }"""
server_code = re.sub(pattern_api_check, replacement_api_check, server_code)

# Fix Entry logic - remove DRY RUN block
pattern_entry = r"""if \(\!isDryRun\) \{(.*?)\} else \{\s*// DRY RUN.*?\n\s*activePositions\[symbol\] = \{.*?\};\s*allTrades\.unshift\(\{ \.\.\.activePositions\[symbol\], is_open: true \}\);\s*addEngineLog\("TRADE", `\[DRY RUN\] \$\{symbol\} \$\{type\.toUpperCase\(\)\} açıldı\.`\);\s*\}"""
server_code = re.sub(pattern_entry, r"\1", server_code, flags=re.DOTALL)

# Fix Exit logic - remove isDryRun check
server_code = server_code.replace("if (!isDryRun && exchange) {", "if (exchange) {")

# Fix /api/v1/balance - return real error if no exchange
server_code = server_code.replace('if (!exchange) return res.json({ balance_usdt: 10000 });', 'if (!exchange) return res.status(400).json({ error: "Borsa bağlantısı yok." });')
server_code = server_code.replace('res.json({ balance_usdt: 10000 });', 'res.json({ balance_usdt: 0 });')

# Fix /api/v1/status
server_code = server_code.replace('trading_mode: isDryRun ? "dry_run" : "live",', 'trading_mode: "live",')

# Fix start log
server_code = server_code.replace('if (isDryRun) addEngineLog("INFO", "Mod: DRY RUN (Gerçek işlem yapılmaz)");\n  else addEngineLog("INFO", "Mod: CANLI İŞLEM (Gerçek emirler gönderilir)");', 'addEngineLog("INFO", "Mod: CANLI İŞLEM (Gerçek Para - Futures)");')

with open("server.ts", "w") as f:
    f.write(server_code)

# 2. CONFIG EDITOR
with open("src/components/ConfigEditor.tsx", "r") as f:
    config_code = f.read()

# Remove the mode selector HTML block
pattern_mode = r"""<div>\s*<label className="block text-xs font-semibold text-slate-400 mb-1">Çalışma Modu</label>\s*<select\s*value=\{parsedConfig\?\.dry_run !== false \? "true" : "false"\}\s*onChange=\{\(e\) => handleUpdate\("dry_run", e\.target\.value === "true"\)\}\s*className="w-full bg-\[\#0b0e14\] border border-slate-700 text-white text-sm rounded-lg p-3"\s*>\s*<option value="true">DRY RUN \(Güvenli Test - Simülasyon\)</option>\s*<option value="false">LIVE \(Gerçek Para - Futures\)</option>\s*</select>\s*</div>"""
config_code = re.sub(pattern_mode, "", config_code, flags=re.DOTALL)

# Also fix the grid to just be single column or span differently, or just leave empty space. It's in a div, so it's fine.

with open("src/components/ConfigEditor.tsx", "w") as f:
    f.write(config_code)

