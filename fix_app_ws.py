import re

with open("src/App.tsx", "r") as f:
    text = f.read()

text = text.replace("'wss://stream.binance.com:9443/ws/!miniTicker@arr'", "'wss://fstream.binance.com/ws/!miniTicker@arr'")

with open("src/App.tsx", "w") as f:
    f.write(text)
