import re

with open("server.ts", "r") as f:
    text = f.read()

pattern = r"""app\.post\("/api/v1/exchange-keys", \(req, res\) => res\.json\(\{status: "success"\}\)\);"""
repl = """app.post("/api/v1/exchange-keys", async (req, res) => {
    const { apiKey, secretKey } = req.body;
    if (!apiKey || !secretKey) {
        return res.json({ success: true }); // Clearing keys
    }
    
    try {
        const ExchangeClass = (ccxt as any).binanceusdm || ccxt.binance;
        const tempExchange = new ExchangeClass({
            apiKey: apiKey.trim(),
            secret: secretKey.trim(),
            enableRateLimit: true,
            options: { defaultType: "future", adjustForTimeDifference: true }
        });
        
        await tempExchange.loadMarkets();
        const bal = await tempExchange.fetchBalance({ type: "future" });
        const usdt = bal.USDT?.total || bal.USDT?.free || 0;
        
        // Re-initialize main exchange if it was stopped due to missing keys
        await initializeExchange();
        
        return res.json({ success: true, balance_usdt: usdt });
    } catch(e: any) {
        return res.json({ success: false, message: e.message });
    }
});"""
text = re.sub(pattern, repl, text)

with open("server.ts", "w") as f:
    f.write(text)
