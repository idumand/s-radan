with open("server.ts", "r") as f:
    content = f.read()

old_block = """        if (SpreadPct < maxSpreadAllowed) {
            // BASİTLEŞTİRİLMİŞ GİRİŞ: Sadece Emir Defteri Dengesizliği (OBI) veya Balina/Duvar Tespiti
            const isSupportStrong = OBI > 0.05 || isBidWallStrong;
            const isResistanceStrong = OBI < -0.05 || isAskWallStrong;"""

new_block = """        if (SpreadPct < maxSpreadAllowed) {
            // PYTHON-GRADE QUANTITATIVE ENTRY LOGIC
            const isOversold = currentRSI < 45;
            const macdBullish = currentMACD && currentMACD.MACD !== undefined && currentMACD.signal !== undefined && currentMACD.MACD > currentMACD.signal;
            const bbBounceLong = currentBB && currentPrice <= (currentBB.lower * 1.001);
            const isSupportStrong = (isOversold && macdBullish) || (bbBounceLong && OBI > 0);

            const isOverbought = currentRSI > 55;
            const macdBearish = currentMACD && currentMACD.MACD !== undefined && currentMACD.signal !== undefined && currentMACD.MACD < currentMACD.signal;
            const bbBounceShort = currentBB && currentPrice >= (currentBB.upper * 0.999);
            const isResistanceStrong = (isOverbought && macdBearish) || (bbBounceShort && OBI < 0);"""

content = content.replace(old_block, new_block)

with open("server.ts", "w") as f:
    f.write(content)
