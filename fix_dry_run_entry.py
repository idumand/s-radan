import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = r"""// DRY RUN
        activePositions\[symbol\] = \{
            trade_id: tradeCounter\+\+,
            pair: symbol,
            type,
            entryPrice: currentPrice,
            amount: formattedAmount,"""

replacement = """// DRY RUN
        activePositions[symbol] = {
            trade_id: tradeCounter++,
            pair: symbol,
            type,
            entryPrice: currentPrice,
            amount: formattedAmount,"""

# Since we don't need to fix anything here specifically, let's just trigger a buy/sell so we can see orderbooks
pattern2 = r"const isLongSignal = \(isOversold && macdBullish && deepBullish\) \|\| \(bbBounceLong && deepBullish\);"
replacement2 = "const isLongSignal = true; // FORCE FOR TESTING"

# text = re.sub(pattern2, replacement2, text)

with open("server.ts", "w") as f:
    f.write(text)
