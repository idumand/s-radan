with open("server.ts", "r") as f:
    text = f.read()

text = text.replace(
    'let longReason = "Güçlü Alıcı Baskısı (OBI > 0.05) veya Destek";\n          addEngineLog(\n            "TRADE",\n            `[LONG SİNYAL] ${longReason}! (OBI: ${OBI.toFixed(2)})`,\n          );',
    'let longReason = `RSI(${currentRSI.toFixed(1)}) & MACD Bullish`;\n          addEngineLog(\n            "TRADE",\n            `[LONG SİNYAL] ${longReason}! (ATR: ${currentATR.toFixed(2)})`,\n          );'
)

text = text.replace(
    'let shortReason = "Güçlü Satıcı Baskısı (OBI < -0.05) veya Direnç";\n          addEngineLog(\n            "TRADE",\n            `[SHORT SİNYAL] ${shortReason}! (OBI: ${OBI.toFixed(2)})`,\n          );',
    'let shortReason = `RSI(${currentRSI.toFixed(1)}) & MACD Bearish`;\n          addEngineLog(\n            "TRADE",\n            `[SHORT SİNYAL] ${shortReason}! (ATR: ${currentATR.toFixed(2)})`,\n          );'
)

with open("server.ts", "w") as f:
    f.write(text)
