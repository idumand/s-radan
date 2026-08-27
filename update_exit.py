import re
with open("server.ts", "r") as f:
    text = f.read()

pattern = r"// EXIT LOGIC \(Çıkış Stratejileri\).*?await closeActivePosition\(exitReason\);\s*\}"

replacement = """// EXIT LOGIC (Çıkış Stratejileri) - Python Quant Style (ATR Based)
      let currentProfitPct = 0; // Kaldıraçlı Kâr Oranı (%) (Arayüz ve hesaplamalar için)
      let baseProfitPct = 0; // 1X Kâr Oranı (%) (Piyasanın saf hareketi)

      if (activePosition.type === "long") {
        activePosition.peakPrice = Math.max(activePosition.peakPrice, currentPrice);
        baseProfitPct = ((currentPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100;
      } else {
        activePosition.peakPrice = Math.min(activePosition.peakPrice, currentPrice);
        baseProfitPct = ((activePosition.entryPrice - currentPrice) / activePosition.entryPrice) * 100;
      }
      
      currentProfitPct = baseProfitPct * targetLeverage;

      let shouldExit = false;
      let exitReason = "";

      // 1x bazlı zararı kes ve trailing hesaplamaları (KOMİSYON DÜŞÜLMÜŞ NET KÂR)
      const basePeakProfitPct =
        activePosition.type === "long"
          ? ((activePosition.peakPrice - activePosition.entryPrice) / activePosition.entryPrice) * 100 - ESTIMATED_FEE_PCT
          : ((activePosition.entryPrice - activePosition.peakPrice) / activePosition.entryPrice) * 100 - ESTIMATED_FEE_PCT;

      baseProfitPct = baseProfitPct - ESTIMATED_FEE_PCT;
      const baseDrawdownFromPeak = basePeakProfitPct - baseProfitPct;

      // ATR Based Dynamic Risk Management
      const atrValue = latestMetrics?.atr || 50; 
      const atrPct = (atrValue / currentPrice) * 100;
      
      // Dynamic targets: Stop Loss = 1.5 ATR, Take Profit = 3.0 ATR, Trailing Start = 1 ATR, Drawdown = 0.5 ATR
      const dynamicHardStop = Math.max(0.15, atrPct * 1.5); 
      const dynamicTakeProfit = Math.max(0.25, atrPct * 3.0);
      const dynamicTrailingStart = Math.max(0.10, atrPct * 1.0);
      const dynamicTrailingDrawdown = Math.max(0.05, atrPct * 0.5);

      // Likidasyon korumalı Stop Loss
      const liqStopBasePct = (100 / targetLeverage) * 0.85;
      const effectiveHardStopBasePct = Math.min(dynamicHardStop, liqStopBasePct, BASE_HARD_STOP_PCT);

      // 3.1 Hard Stop - Zararı kes
      if (baseProfitPct <= -effectiveHardStopBasePct) {
        shouldExit = true;
        exitReason = `Zarar Kes (ATR Dinamik Stop %${effectiveHardStopBasePct.toFixed(2)})`;
      }
      // 3.2 Kâr Alma
      else if (baseProfitPct >= dynamicTakeProfit) {
        shouldExit = true;
        exitReason = `Kâr Hedefi (ATR Dinamik %${dynamicTakeProfit.toFixed(2)})`;
      }
      // 3.3 Dynamic Trailing Exit
      else if (basePeakProfitPct >= dynamicTrailingStart && baseDrawdownFromPeak >= dynamicTrailingDrawdown) {
        shouldExit = true;
        exitReason = `İzleyen Stop (ATR Dinamik Kâr Koruma Zirveden %${baseDrawdownFromPeak.toFixed(2)} Dönüş)`;
      }

      if (shouldExit) {
        await closeActivePosition(exitReason);
      }"""

new_text = re.sub(pattern, replacement, text, flags=re.DOTALL)
with open("server.ts", "w") as f:
    f.write(new_text)
