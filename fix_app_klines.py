import re

with open("src/App.tsx", "r") as f:
    text = f.read()

text = text.replace("https://api.binance.com/api/v3/klines?", "https://fapi.binance.com/fapi/v1/klines?")

with open("src/App.tsx", "w") as f:
    f.write(text)
