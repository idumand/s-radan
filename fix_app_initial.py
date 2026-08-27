import re

with open("src/App.tsx", "r") as f:
    text = f.read()

pattern = r"""const \[markets, setMarkets\] = useState<MarketPairInfo\[\]>\(INITIAL_MARKETS\);"""
repl = """const [markets, setMarkets] = useState<MarketPairInfo[]>(INITIAL_MARKETS);

  useEffect(() => {
    // Fetch initial 24hr ticker data to hydrate INITIAL_MARKETS with real values immediately
    const fetchTickers = async () => {
      try {
        const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
        const data = await res.json();
        if (Array.isArray(data)) {
           setMarkets(prev => {
              return prev.map(m => {
                 const binanceSymbol = m.symbol.replace('/', '');
                 const ticker = data.find((d: any) => d.symbol === binanceSymbol);
                 if (ticker) {
                    return {
                       ...m,
                       price: parseFloat(ticker.lastPrice),
                       change_24h_pct: parseFloat(ticker.priceChangePercent),
                       volume_24h_usdt: parseFloat(ticker.quoteVolume),
                       high_24h: parseFloat(ticker.highPrice),
                       low_24h: parseFloat(ticker.lowPrice)
                    };
                 }
                 return m;
              });
           });
        }
      } catch (e) {}
    };
    fetchTickers();
  }, []);"""

text = re.sub(pattern, repl, text)

with open("src/App.tsx", "w") as f:
    f.write(text)
