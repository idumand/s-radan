import re

with open("src/App.tsx", "r") as f:
    text = f.read()

pattern = r"""\s*const priceMap = new Map<string, number>\(\);\s*data\.forEach\(\(item: any\) => \{\s*if \(item\.s && item\.c\) \{\s*const price = parseFloat\(item\.c\);\s*priceMap\.set\(item\.s, price\);\s*livePricesRef\.current\.set\(item\.s, price\);\s*\}\s*\}\);\s*setMarkets\(\(prevMarkets\) => \{\s*let changed = false;\s*const newMarkets = prevMarkets\.map\(\(m\) => \{\s*const binanceSymbol = m\.symbol\.replace\('/', ''\);\s*if \(priceMap\.has\(binanceSymbol\)\) \{\s*const newPrice = priceMap\.get\(binanceSymbol\);\s*if \(newPrice && newPrice !== m\.price\) \{\s*changed = true;\s*return \{ \.\.\.m, price: newPrice \};\s*\}\s*\}\s*return m;\s*\}\);\s*return changed \? newMarkets : prevMarkets;\s*\}\);"""

repl = """
          const tickMap = new Map<string, any>();
          data.forEach((item: any) => {
            if (item.s && item.c) {
              tickMap.set(item.s, item);
              livePricesRef.current.set(item.s, parseFloat(item.c));
            }
          });

          setMarkets((prevMarkets) => {
            let changed = false;
            const newMarkets = prevMarkets.map((m) => {
              const binanceSymbol = m.symbol.replace('/', '');
              if (tickMap.has(binanceSymbol)) {
                const tick = tickMap.get(binanceSymbol);
                const newPrice = parseFloat(tick.c);
                const openPrice = parseFloat(tick.o);
                const changePct = openPrice ? ((newPrice - openPrice) / openPrice) * 100 : m.change_24h_pct;
                const volumeQuote = parseFloat(tick.q) || m.volume_24h_usdt;
                
                if (newPrice !== m.price || Math.abs(changePct - m.change_24h_pct) > 0.05) {
                  changed = true;
                  return { 
                    ...m, 
                    price: newPrice,
                    change_24h_pct: Number(changePct.toFixed(2)),
                    volume_24h_usdt: volumeQuote
                  };
                }
              }
              return m;
            });
            return changed ? newMarkets : prevMarkets;
          });
"""

text = re.sub(pattern, repl, text)

# Also update the trades profit map to use tickMap
text = text.replace("if (priceMap.has(binanceSymbol)) {", "if (tickMap.has(binanceSymbol)) {")
text = text.replace("const newRate = priceMap.get(binanceSymbol) || t.current_rate;", "const newRate = parseFloat(tickMap.get(binanceSymbol)?.c) || t.current_rate;")

with open("src/App.tsx", "w") as f:
    f.write(text)
