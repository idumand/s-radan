import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = r'app\.get\("/api/v1/orderbook", \(req, res\) => \{.*?\n\}\);'
replacement = """app.get("/api/v1/orderbook", (req, res) => {
  const symbol = whitelistCoins[0] || "BTC/USDT";
  const ob = latestOrderBooks[symbol];
  const m = latestMetricsPerCoin[symbol];
  if (!ob || !m) {
      return res.json({});
  }
  
  const OBI = 0; // We calculate deepScore instead
  const MicroPrice = m.currentPrice;
  const MidPrice = m.currentPrice;
  const deltaV = 0;
  const currentPrice = m.currentPrice;
  const VWAP = m.currentPrice;
  const stdDev = 0;
  const SpreadPct = 0;
  
  res.json({
     orderBook: ob,
     metrics: {
        OBI, MicroPrice, MidPrice, deltaV, currentPrice, VWAP, stdDev, SpreadPct,
        deepScore: m.deepScore,
        atr: m.atr
     }
  });
});"""

text = re.sub(pattern, replacement, text, flags=re.DOTALL)

with open("server.ts", "w") as f:
    f.write(text)
