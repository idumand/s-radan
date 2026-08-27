import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = """if (!apiKey || !secret) {
      addEngineLog("ERROR", "API Key veya Secret eksik! GERÇEK PARA İLE İŞLEM YAPILAMAZ. Motor durduruldu.");
      botState = "stopped";
      return { success: false, message: "API Keys missing" };
    }"""

# Remove botState = stopped so it returns success false but doesn't crash the UI state immediately, just logs it. Wait, the user wants strict API checks.
# Actually, the error is binanceusdm {"code":-2015,"msg":"Invalid API-key, IP, or permissions for action."}
# This means the API key is present but INVALID or IP blocked.
# This means the real logic is fully active!

