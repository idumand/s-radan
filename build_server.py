import os

new_server_code = """
import express from "express";
import path from "path";
import fs from "fs";
import ccxt from "ccxt";
import { RSI, MACD, BollingerBands, ATR } from "technicalindicators";
import { createServer as createViteServer } from "vite";
import { exec } from "child_process";

const app = express();
const PORT = process.env.PORT || 3000;

// =============== STATE & CONFIG ===============
let botState = "stopped";
let engineLoop: NodeJS.Timeout | null = null;
let lastLogId = 0;
const engineLogs: any[] = [];
let serverIp = "Tespit ediliyor...";
let lastIpFetchTime = 0;

let exchange: ccxt.Exchange | null = null;
let isDryRun = true;
let targetLeverage = 15;
let tradeCounter = 1;

let whitelistCoins: string[] = ["BTC/USDT"];
let activeRiskProfile: "conservative" | "balanced" | "aggressive" = "balanced";
let activeSmartTargetPct: 3 | 5 | 10 | 15 = 10;

// Position management per coin
interface ActivePosition {
  trade_id: number;
  pair: string;
  type: "long" | "short";
  entryPrice: number;
  amount: number;
  peakPrice: number;
  openDate: number;
  targetPct: number;
  riskProfile: string;
  deepScoreHistory: number[];
  leverage: number;
  baseStopPrice: number;
  binanceStopOrderId?: string;
  breakevenHit?: boolean;
}

const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};

// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08; // Base %0.08 roundtrip (maker+taker)
const RISK_PROFILES = {
  conservative: { hardStop: 0.8, breakevenStart: 1.0, trailingStart: 1.5, trailingDrawdown: 0.5 },
  balanced: { hardStop: 1.5, breakevenStart: 2.0, trailingStart: 3.0, trailingDrawdown: 1.0 },
  aggressive: { hardStop: 2.5, breakevenStart: 3.0, trailingStart: 5.0, trailingDrawdown: 1.5 }
};

// =============== HELPERS ===============
function addEngineLog(level: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  lastLogId++;
  engineLogs.unshift({ id: lastLogId.toString(), timestamp, level, message });
  if (engineLogs.length > 100) engineLogs.length = 100;
  console.log(`[${level}] ${timestamp} - ${message}`);
}

async function fetchServerIp() {
  const now = Date.now();
  if (now - lastIpFetchTime > 300000) {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      serverIp = data.ip;
      lastIpFetchTime = now;
    } catch (e) {
      serverIp = "Bağlantı Hatası";
    }
  }
  return serverIp;
}

// =============== INITIALIZATION ===============
async function initializeExchange() {
  try {
    let confStr = "{}";
    if (fs.existsSync("config.json")) {
      confStr = fs.readFileSync("config.json", "utf8");
    }
    const conf = JSON.parse(confStr);
    
    const apiKey = conf?.exchange?.key || process.env.BINANCE_API_KEY;
    const secret = conf?.exchange?.secret || process.env.BINANCE_API_SECRET;
    
    isDryRun = conf?.dry_run !== false;
    targetLeverage = conf?.leverage || 15;
    
    if (conf?.exchange?.pair_whitelist && conf.exchange.pair_whitelist.length > 0) {
      whitelistCoins = conf.exchange.pair_whitelist;
    }
    
    if (conf?.risk_profile) activeRiskProfile = conf.risk_profile;
    if (conf?.smart_target) activeSmartTargetPct = conf.smart_target;

    if (!apiKey || !secret) {
      return { success: false, message: "API Key veya Secret Key eksik. Simülasyon moduna geçildi." };
    }

    // Initialize USDT-M Futures explicitly
    const ExchangeClass = (ccxt as any).binanceusdm || ccxt.binance;
    exchange = new ExchangeClass({
      apiKey: apiKey.trim(),
      secret: secret.trim(),
      enableRateLimit: true,
      options: {
        defaultType: "future",
        adjustForTimeDifference: true,
      },
    });

    await exchange!.loadMarkets();
    
    // Sync existing positions on startup
    if (!isDryRun) {
        try {
            const positions = await exchange!.fetchPositions();
            for (const p of positions) {
                if (p.contracts && p.contracts > 0 && whitelistCoins.includes(p.symbol)) {
                    const posType = p.side === 'long' ? 'long' : 'short';
                    activePositions[p.symbol] = {
                        trade_id: tradeCounter++,
                        pair: p.symbol,
                        type: posType,
                        entryPrice: p.entryPrice || p.markPrice || 0,
                        amount: p.contracts,
                        peakPrice: p.entryPrice || p.markPrice || 0,
                        openDate: Date.now(),
                        targetPct: activeSmartTargetPct,
                        riskProfile: activeRiskProfile,
                        deepScoreHistory: [],
                        leverage: p.leverage || targetLeverage,
                        baseStopPrice: 0 // Will be updated
                    };
                    addEngineLog("INFO", `Mevcut Borsa Pozisyonu Senkronize Edildi: ${p.symbol} ${posType} x${p.leverage}`);
                }
            }
        } catch(e: any) {
             addEngineLog("WARN", "Mevcut pozisyonlar alınamadı: " + e.message);
        }
    }
    
    return { success: true, message: "Borsa başarıyla başlatıldı." };
  } catch (error: any) {
    addEngineLog("ERROR", `Borsa başlatılamadı: ${error.message}`);
    return { success: false, message: error.message };
  }
}

// =============== DEEP ANALYSIS ENGINE ===============
function calculateDeepScore(ob: any, trades: any[], currentPrice: number) {
  let score = 0; // -100 to +100
  
  if (!ob || !ob.bids || !ob.asks || ob.bids.length === 0 || ob.asks.length === 0) return 0;

  // 1. OBI & Bid/Ask Delta
  const bidVol = ob.bids.slice(0, 20).reduce((acc: number, b: any) => acc + b[1], 0);
  const askVol = ob.asks.slice(0, 20).reduce((acc: number, a: any) => acc + a[1], 0);
  const totalVol = bidVol + askVol;
  const obi = totalVol > 0 ? (bidVol - askVol) / totalVol : 0;
  
  score += obi * 40; // Max +-40 from OBI

  // 2. Micro-Price
  const bestBid = ob.bids[0][0];
  const bestAsk = ob.asks[0][0];
  const microPrice = totalVol > 0 ? ((bestBid * askVol) + (bestAsk * bidVol)) / totalVol : currentPrice;
  const spread = bestAsk - bestBid;
  
  if (microPrice > currentPrice) score += 10;
  else if (microPrice < currentPrice) score -= 10;

  // 3. Trade Momentum (Buy vs Sell volume in last trades)
  if (trades && trades.length > 0) {
      let recentBuyVol = 0;
      let recentSellVol = 0;
      trades.forEach((t:any) => {
          if (t.side === 'buy') recentBuyVol += t.amount;
          else if (t.side === 'sell') recentSellVol += t.amount;
      });
      const tradeMom = (recentBuyVol - recentSellVol) / (recentBuyVol + recentSellVol || 1);
      score += tradeMom * 30; // Max +- 30 from trades
  }
  
  // Normalize
  return Math.max(-100, Math.min(100, score));
}

// =============== CORE LOGIC LOOP ===============
async function executeRealTradeLogic() {
  if (botState !== "running") return;
  
  if (!exchange) {
    // Retry initialization if failed
    await initializeExchange();
    if (!exchange) return;
  }

  for (const symbol of whitelistCoins) {
      try {
        if (!exchange.markets || !exchange.markets[symbol]) continue;
        
        const market = exchange.markets[symbol];
        // Fetch specific data
        const [ticker, ob, ohlcv, recentTrades] = await Promise.all([
           exchange.fetchTicker(symbol),
           exchange.fetchOrderBook(symbol, 20),
           exchange.fetchOHLCV(symbol, "1m", undefined, 50),
           exchange.fetchTrades(symbol, undefined, 20)
        ]);

        const currentPrice = ticker.last || 0;
        if (!currentPrice) continue;

        latestOrderBooks[symbol] = ob;
        
        // Technicals
        const closes = ohlcv.map((c) => c[4]);
        const rsiData = RSI.calculate({ period: 14, values: closes });
        const macdData = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        const atrData = ATR.calculate({ high: ohlcv.map((c)=>c[2]), low: ohlcv.map((c)=>c[3]), close: closes, period: 14 });
        const bbData = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });

        const currentRSI = rsiData[rsiData.length - 1] || 50;
        const currentMACD = macdData[macdData.length - 1];
        const currentATR = atrData[atrData.length - 1] || (currentPrice * 0.01);
        const currentBB = bbData[bbData.length - 1];

        // Deep Analysis
        const deepScore = calculateDeepScore(ob, recentTrades, currentPrice);

        latestMetricsPerCoin[symbol] = {
            currentPrice, rsi: currentRSI, macd: currentMACD, atr: currentATR, deepScore
        };

        const pos = activePositions[symbol];

        // ================= EXIT LOGIC =================
        if (pos) {
             pos.deepScoreHistory.push(deepScore);
             if (pos.deepScoreHistory.length > 5) pos.deepScoreHistory.shift();
             
             if (pos.type === "long") pos.peakPrice = Math.max(pos.peakPrice, currentPrice);
             else pos.peakPrice = Math.min(pos.peakPrice, currentPrice);

             // Base 1x Profit calculations
             const baseProfitPct = pos.type === "long" 
                 ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
                 : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

             const basePeakProfitPct = pos.type === "long"
                 ? ((pos.peakPrice - pos.entryPrice) / pos.entryPrice) * 100
                 : ((pos.entryPrice - pos.peakPrice) / pos.entryPrice) * 100;
             
             const netBaseProfitPct = baseProfitPct - ESTIMATED_FEE_PCT;
             const baseDrawdownFromPeak = basePeakProfitPct - baseProfitPct;

             const risk = RISK_PROFILES[pos.riskProfile as keyof typeof RISK_PROFILES] || RISK_PROFILES.balanced;
             
             let shouldExit = false;
             let exitReason = "";

             // 1. Target Hit
             if (netBaseProfitPct >= pos.targetPct) {
                 shouldExit = true;
                 exitReason = `Kâr Hedefi (1x +%${pos.targetPct.toFixed(2)} Yakalandı)`;
             }
             // 2. Hard Stop (Base 1x)
             else if (netBaseProfitPct <= -risk.hardStop) {
                 shouldExit = true;
                 exitReason = `Hard Stop (1x Zarar -%${risk.hardStop.toFixed(2)})`;
             }
             // 3. Breakeven Stop
             else if (basePeakProfitPct >= risk.breakevenStart && netBaseProfitPct <= 0.1) {
                 shouldExit = true;
                 exitReason = `Başabaş Koruması (Kâr +%${risk.breakevenStart.toFixed(2)} gördükten sonra dönüş)`;
             }
             // 4. Trailing Stop
             else if (basePeakProfitPct >= risk.trailingStart && baseDrawdownFromPeak >= risk.trailingDrawdown) {
                 shouldExit = true;
                 exitReason = `İzleyen Stop (Zirveden %${risk.trailingDrawdown.toFixed(2)} dönüş)`;
             }
             // 5. Early Exit in Profit (Deep Score Reversal)
             else if (netBaseProfitPct >= 3.0) {
                 // Strong reversal logic
                 if (pos.type === "long" && pos.deepScoreHistory.filter(s => s < -50).length >= 2) {
                     shouldExit = true;
                     exitReason = "Akıllı Çıkış (Kârdayken Emir Defteri Güçlü Satışa Döndü)";
                 } else if (pos.type === "short" && pos.deepScoreHistory.filter(s => s > 50).length >= 2) {
                     shouldExit = true;
                     exitReason = "Akıllı Çıkış (Kârdayken Emir Defteri Güçlü Alışa Döndü)";
                 }
             }
             // 6. Early Exit in Loss (Deep Score Reversal before hard stop)
             else if (netBaseProfitPct <= -0.4) {
                 if (pos.type === "long" && pos.deepScoreHistory.filter(s => s < -70).length >= 2) {
                     shouldExit = true;
                     exitReason = "Akıllı Zarar Kes (Hard Stop Beklenmeden Güçlü Satış Teyit Edildi)";
                 } else if (pos.type === "short" && pos.deepScoreHistory.filter(s => s > 70).length >= 2) {
                     shouldExit = true;
                     exitReason = "Akıllı Zarar Kes (Hard Stop Beklenmeden Güçlü Alış Teyit Edildi)";
                 }
             }

             if (shouldExit) {
                 await executeExit(symbol, exitReason, currentPrice);
             }

        } 
        // ================= ENTRY LOGIC =================
        else {
             // Quant Entry Logic
             const isOversold = currentRSI < 45;
             const isOverbought = currentRSI > 55;
             const macdBullish = currentMACD && currentMACD.MACD > currentMACD.signal;
             const macdBearish = currentMACD && currentMACD.MACD < currentMACD.signal;
             const bbBounceLong = currentBB && currentPrice <= (currentBB.lower * 1.001);
             const bbBounceShort = currentBB && currentPrice >= (currentBB.upper * 0.999);

             const deepBullish = deepScore > 40;
             const deepBearish = deepScore < -40;

             const isLongSignal = (isOversold && macdBullish && deepBullish) || (bbBounceLong && deepBullish);
             const isShortSignal = (isOverbought && macdBearish && deepBearish) || (bbBounceShort && deepBearish);

             if (isLongSignal || isShortSignal) {
                 const type = isLongSignal ? "long" : "short";
                 await executeEntry(symbol, type, currentPrice);
             }
        }

      } catch(e: any) {
          // addEngineLog("ERROR", `Loop Error [${symbol}]: ${e.message}`);
      }
  }
}

async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number) {
    if (activePositions[symbol]) return;
    
    // Check margin and limits
    let rawAmount = 25 / currentPrice; // Approx $25 margin base example
    const market = exchange!.markets[symbol];
    if (!market) return;
    
    // Adhere to Binance precision and limits
    let finalAmount = rawAmount * targetLeverage;
    if (market.limits && market.limits.amount && market.limits.amount.min) {
        if (finalAmount < market.limits.amount.min) finalAmount = market.limits.amount.min;
    }
    
    const formattedAmount = Number(exchange!.amountToPrecision(symbol, finalAmount));
    
    addEngineLog("TRADE", `[SİNYAL] ${symbol} ${type.toUpperCase()} tespit edildi. Miktar: ${formattedAmount}`);

    if (!isDryRun) {
        try {
            await exchange!.setLeverage(targetLeverage, symbol);
        } catch(e) {}
        try {
            // Actual order
            const side = type === "long" ? "buy" : "sell";
            const order = await exchange!.createOrder(symbol, "market", side, formattedAmount);
            
            // Binance Protective STOP_MARKET
            const risk = RISK_PROFILES[activeRiskProfile];
            let stopPriceBase = type === "long" ? currentPrice * (1 - risk.hardStop/100) : currentPrice * (1 + risk.hardStop/100);
            const stopPrice = Number(exchange!.priceToPrecision(symbol, stopPriceBase));
            const stopSide = type === "long" ? "sell" : "buy";
            
            let stopOrderId;
            try {
               const stopOrder = await exchange!.createOrder(symbol, "STOP_MARKET", stopSide, formattedAmount, undefined, { stopPrice, reduceOnly: true });
               stopOrderId = stopOrder.id;
            } catch(e:any) {
               addEngineLog("WARN", `Borsa Stop Emri Hatası (Internal Stop kullanılacak): ${e.message}`);
            }

            activePositions[symbol] = {
                trade_id: tradeCounter++,
                pair: symbol,
                type,
                entryPrice: order.price || currentPrice,
                amount: formattedAmount,
                peakPrice: order.price || currentPrice,
                openDate: Date.now(),
                targetPct: activeSmartTargetPct,
                riskProfile: activeRiskProfile,
                deepScoreHistory: [],
                leverage: targetLeverage,
                baseStopPrice: stopPrice,
                binanceStopOrderId: stopOrderId
            };
            
            allTrades.unshift({ ...activePositions[symbol], is_open: true });
            addEngineLog("TRADE", `[CANLI] ${symbol} ${type.toUpperCase()} açıldı. Kâr Hedefi: %${activeSmartTargetPct} (1x)`);
        } catch(e: any) {
            addEngineLog("ERROR", `[CANLI] ${symbol} Giriş Emri Reddedildi: ${e.message}`);
        }
    } else {
        // DRY RUN
        activePositions[symbol] = {
            trade_id: tradeCounter++,
            pair: symbol,
            type,
            entryPrice: currentPrice,
            amount: formattedAmount,
            peakPrice: currentPrice,
            openDate: Date.now(),
            targetPct: activeSmartTargetPct,
            riskProfile: activeRiskProfile,
            deepScoreHistory: [],
            leverage: targetLeverage,
            baseStopPrice: 0
        };
        allTrades.unshift({ ...activePositions[symbol], is_open: true });
        addEngineLog("TRADE", `[DRY RUN] ${symbol} ${type.toUpperCase()} açıldı.`);
    }
}

async function executeExit(symbol: string, reason: string, currentPrice: number) {
    const pos = activePositions[symbol];
    if (!pos) return;

    addEngineLog("TRADE", `[ÇIKIŞ] ${symbol} ${reason}`);

    if (!isDryRun && exchange) {
        try {
            const side = pos.type === "long" ? "sell" : "buy";
            await exchange.createOrder(symbol, "market", side, pos.amount, undefined, { reduceOnly: true });
            
            // Cancel associated stop order if it exists
            if (pos.binanceStopOrderId) {
                try {
                    await exchange.cancelOrder(pos.binanceStopOrderId, symbol);
                } catch(e){}
            }
        } catch (e: any) {
            addEngineLog("ERROR", `[CANLI] ${symbol} Çıkış Emri Hatası: ${e.message}`);
            // If it says position closed or invalid, we still remove it from local state
        }
    }

    const tradeIndex = allTrades.findIndex(t => t.trade_id === pos.trade_id);
    if (tradeIndex !== -1) {
        allTrades[tradeIndex].is_open = false;
        allTrades[tradeIndex].close_rate = currentPrice;
        allTrades[tradeIndex].close_date = Date.now();
        allTrades[tradeIndex].close_reason = reason;
        
        const rawPct = pos.type === "long" 
           ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
           : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
           
        allTrades[tradeIndex].profit_abs = pos.type === "long"
           ? (currentPrice - pos.entryPrice) * pos.amount * pos.leverage
           : (pos.entryPrice - currentPrice) * pos.amount * pos.leverage;
           
        allTrades[tradeIndex].profit_pct = (rawPct - ESTIMATED_FEE_PCT) * pos.leverage;
    }
    
    delete activePositions[symbol];
}

function startTradingEngine() {
  if (botState === "running") return;
  botState = "running";
  addEngineLog("INFO", "Node.js Futures Ticaret Motoru Başlatıldı.");
  if (isDryRun) addEngineLog("INFO", "Mod: DRY RUN (Gerçek işlem yapılmaz)");
  else addEngineLog("INFO", "Mod: CANLI İŞLEM (Gerçek emirler gönderilir)");
  
  initializeExchange();
  engineLoop = setInterval(executeRealTradeLogic, 3000);
}

async function stopTradingEngine() {
  botState = "stopped";
  if (engineLoop) clearInterval(engineLoop);
  addEngineLog("INFO", "Node.js Ticaret Motoru Durduruldu.");
}

// =============== API ROUTES ===============
app.use(express.json());

app.get("/api/v1/status", (req, res) => {
  fetchServerIp();
  res.json({
    state: botState,
    trading_mode: isDryRun ? "dry_run" : "live",
    strategy: "Deep_Quant_Futures",
    timeframe: "1m",
    open_trades: Object.keys(activePositions).length,
    max_open_trades: 5,
    server_ip: serverIp,
  });
});

app.get("/api/v1/balance", async (req, res) => {
  if (!exchange) return res.json({ balance_usdt: 10000 });
  try {
    const bal = await exchange.fetchBalance({ type: "future" });
    const usdt = bal.USDT?.total || bal.USDT?.free || 0;
    res.json({ balance_usdt: usdt });
  } catch (e) {
    res.json({ balance_usdt: 10000 });
  }
});

app.get("/api/v1/config", (req, res) => {
  res.json({
      exchange: { pair_whitelist: whitelistCoins },
      dry_run: isDryRun,
      leverage: targetLeverage,
      risk_profile: activeRiskProfile,
      smart_target: activeSmartTargetPct
  });
});

app.post("/api/v1/config", (req, res) => {
  const conf = req.body;
  if (conf.exchange?.pair_whitelist) whitelistCoins = conf.exchange.pair_whitelist;
  if (conf.dry_run !== undefined) isDryRun = conf.dry_run;
  if (conf.leverage) targetLeverage = conf.leverage;
  if (conf.risk_profile) activeRiskProfile = conf.risk_profile;
  if (conf.smart_target) activeSmartTargetPct = conf.smart_target;
  
  fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
  addEngineLog("SYSTEM", "Konfigürasyon güncellendi.");
  res.json({ status: "success" });
});

app.get("/api/v1/logs", (req, res) => {
  res.json({ logs: engineLogs });
});

app.get("/api/v1/trades", (req, res) => {
  const mappedTrades = allTrades.map(t => {
      let currentRate = t.entryPrice;
      if (t.is_open && latestMetricsPerCoin[t.pair]) {
          currentRate = latestMetricsPerCoin[t.pair].currentPrice;
      }
      
      const rawProfitPct = t.type === "long" 
           ? ((currentRate - t.entryPrice) / t.entryPrice) * 100
           : ((t.entryPrice - currentRate) / t.entryPrice) * 100;
           
      const profitPct = Number(((rawProfitPct - ESTIMATED_FEE_PCT) * t.leverage).toFixed(2));
      const absProfit = t.type === "long"
           ? (currentRate - t.entryPrice) * t.amount * t.leverage
           : (t.entryPrice - currentRate) * t.amount * t.leverage;

      return {
          id: t.trade_id.toString(),
          pair: t.pair,
          is_open: t.is_open,
          type: t.type,
          amount: t.amount,
          leverage: t.leverage,
          open_rate: t.entryPrice,
          current_rate: t.close_rate || currentRate,
          close_rate: t.close_rate,
          open_date: new Date(t.openDate).toISOString(),
          close_date: t.close_date ? new Date(t.close_date).toISOString() : undefined,
          close_reason: t.close_reason,
          profit_pct: t.is_open ? profitPct : t.profit_pct,
          profit_abs: t.is_open ? absProfit : t.profit_abs,
          profit_ratio: (t.is_open ? profitPct : t.profit_pct) / 100,
          deep_score: latestMetricsPerCoin[t.pair]?.deepScore || 0,
          target_pct: t.targetPct,
          risk_profile: t.riskProfile
      };
  });
  
  res.json({ trades: mappedTrades });
});

app.get("/api/v1/profit", (req, res) => {
  const closedTrades = allTrades.filter(t => !t.is_open);
  const winning = closedTrades.filter(t => t.profit_abs > 0);
  const total = closedTrades.reduce((acc, t) => acc + (t.profit_abs || 0), 0);
  
  res.json({
    profit_closed_coin: total,
    winning_trades: winning.length,
    losing_trades: closedTrades.length - winning.length,
    winrate: closedTrades.length > 0 ? winning.length / closedTrades.length : 0
  });
});

app.post("/api/v1/start", (req, res) => {
  startTradingEngine();
  res.json({ status: "success", message: "Node.js Bot Engine Started" });
});

app.post("/api/v1/stop", async (req, res) => {
  await stopTradingEngine();
  res.json({ status: "success", message: "Node.js Bot Engine Stopped" });
});

app.post("/api/v1/forceexit", async (req, res) => {
  const { tradeid } = req.body;
  if (tradeid === "all") {
      for (const sym of Object.keys(activePositions)) {
          await executeExit(sym, "Manuel Zorla Kapatıldı", latestMetricsPerCoin[sym]?.currentPrice || 0);
      }
      return res.json({ status: "success", message: "Tüm işlemler kapatıldı." });
  } else {
      const posEntry = Object.entries(activePositions).find(([_, p]) => p.trade_id.toString() === tradeid.toString());
      if (posEntry) {
          await executeExit(posEntry[0], "Manuel Zorla Kapatıldı", latestMetricsPerCoin[posEntry[0]]?.currentPrice || 0);
          return res.json({ status: "success", message: "İşlem kapatıldı." });
      }
  }
  res.status(400).json({ error: "İşlem bulunamadı." });
});

// Deep Data for UI
app.get("/api/v1/deepdata", (req, res) => {
   res.json({ metrics: latestMetricsPerCoin, orderbooks: latestOrderBooks });
});

// Futures Search Proxy
app.get("/api/v1/markets/search", async (req, res) => {
   if (!exchange) {
       // Temporary dummy for ui testing if api key missing
       return res.json({ markets: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "SUI/USDT", "SEI/USDT"] });
   }
   try {
       const q = (req.query.q as string)?.toUpperCase() || "";
       const markets = Object.keys(exchange.markets).filter(m => m.includes(q) && m.endsWith("/USDT") && exchange!.markets[m].linear);
       res.json({ markets: markets.slice(0, 20) });
   } catch(e) {
       res.status(500).json({ error: "Arama yapılamadı" });
   }
});

// Vite middleware in development
if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then(vite => app.use(vite.middlewares));
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Deep Futures Engine running at http://0.0.0.0:${PORT}`);
});
"""

with open("server.ts", "w") as f:
    f.write(new_server_code)
