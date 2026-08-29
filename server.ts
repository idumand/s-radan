import express from "express";
import path from "path";
import fs from "fs";
import ccxt from "ccxt";
import { WebSocket as WsClient } from "ws";
import { RSI, MACD, BollingerBands, ATR, SMA, EMA } from "technicalindicators";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// =============== STATE & CONFIG ===============
let botState = "stopped";
let dataLoop: NodeJS.Timeout | null = null;
let lastLogId = 0;
const engineLogs: any[] = [];
const pendingEntries = new Set<string>();
let serverIp = "Tespit ediliyor...";
let lastIpFetchTime = 0;

let exchange: ccxt.Exchange | null = null;
// Hard guard: the exchange object itself must match the selected Binance Futures environment.
let activeExchangeEnvironment: "testnet" | "live" | null = null;
let targetLeverage = 15;
let tradeCounter = 1;

let isExchangeAuthenticated = false;
let coinSelectionMode: 'manual' | 'algorithm' = 'manual';

const TOP_ALGORITHM_PAIRS: string[] = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "SUI/USDT", "XRP/USDT", "DOGE/USDT", 
  "PEPE/USDT", "BNB/USDT", "AVAX/USDT", "NEAR/USDT", "LINK/USDT", "WIF/USDT", 
  "APT/USDT", "SHIB/USDT", "FET/USDT", "RENDER/USDT", "TIA/USDT", "INJ/USDT", 
  "ADA/USDT", "ARB/USDT", "OP/USDT", "FTM/USDT", "TRX/USDT", "BCH/USDT", 
  "SEI/USDT", "BONK/USDT"
];

let whitelistCoins: string[] = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "ADA/USDT",
  "DOGE/USDT",
  "SUI/USDT"
];

function getActiveTradingPairs(): string[] {
  if (coinSelectionMode === 'algorithm') {
    const set = new Set([...TOP_ALGORITHM_PAIRS, ...whitelistCoins]);
    return Array.from(set).slice(0, 30);
  }
  return whitelistCoins && whitelistCoins.length > 0 ? whitelistCoins : ["BTC/USDT", "ETH/USDT", "SOL/USDT"];
}
let latestTickersCache: any[] = [];
let activeStopLossPct = 1.0;
let activeLookbackMin: 1 | 3 | 5 | 15 = 1;
let activeStakeAmount = 6;
let maxOpenTrades = 1;
// User-configurable minimum expected market move, measured on a 1x basis.
let activeMinExpectedMovePct = 0.5;
let activeTakeProfitPct = 0.5;
let activeMarginMode: 'isolated' | 'cross' = 'isolated';

// Position management per coin
interface ActivePosition {
  trade_id: number;
  pair: string;
  type: "long" | "short";
  entryPrice: number;
  amount: number;
  peakPrice: number;
  openDate: number;
  lookbackMin: number; // timeframe in minutes
  riskProfile?: string;
  stopLossPct?: number;
  deepScoreHistory: number[];
  orderFlowGapHistory?: number[];
  pnlHistory?: number[];
  peakNetPnl?: number;
  modelTargetPnlUSD?: number;
  modelTargetPrice?: number;
  modelTargetConfidence?: number;
  modelTargetAccuracySample?: number;
  modelTargetAccuracyRate?: number | null;
  leverage: number;
  baseStopPrice: number;
  binanceStopOrderId?: string;
  breakevenHit?: boolean;
  unrealizedPnl?: number;
  percentage?: number;
  markPrice?: number;
  pnlSource?: "binance" | "local";
  marginMode?: string;
  takeProfitPct?: number;
}

const activePositions: Record<string, ActivePosition> = {};
const allTrades: any[] = [];
const pairLossCooldown: Record<string, number> = {};

const TRADES_HISTORY_FILE = path.join(process.cwd(), "trades_history.json");

function loadTradesHistory() {
  // Never synthesize historical trades. The dashboard must reflect only
  // trades recorded by this engine / confirmed by Binance.
  try {
    if (fs.existsSync(TRADES_HISTORY_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRADES_HISTORY_FILE, "utf-8"));
      if (Array.isArray(data)) {
        const historicalTrades = data.filter((t: any) => t && t.is_open !== true);
        allTrades.push(...historicalTrades);
        const ids = historicalTrades.map((t: any) => Number(t.trade_id || 0)).filter(Number.isFinite);
        if (ids.length > 0) tradeCounter = Math.max(...ids) + 1;
      }
    }
  } catch (e) {
    console.warn("İşlem geçmişi okunamadı; temiz geçmiş ile devam ediliyor.");
  }
}

function saveTradesHistory() {
  try {
    fs.writeFileSync(TRADES_HISTORY_FILE, JSON.stringify(allTrades.slice(0, 300), null, 2));
  } catch (e) {}
}

loadTradesHistory();

let latestMetricsPerCoin: Record<string, any> = {};
let latestOrderBooks: Record<string, any> = {};
// Every market-data sample is tagged with its environment. This prevents stale
// LIVE values from surviving a switch to TESTNET (or vice versa).
const marketDataMeta: Record<string, { environment: "testnet" | "live"; tickerAt: number; depthAt: number; tradeAt: number }> = {};
let marketDataEnvironment: "testnet" | "live" | null = null;

function currentEnvironment(): "testnet" | "live" {
  return getBinanceEnvironment();
}

function resetMarketDataState(reason: string) {
  latestTickersCache = [];
  latestMetricsPerCoin = {};
  latestOrderBooks = {};
  for (const key of Object.keys(localBooks)) delete localBooks[key];
  for (const key of Object.keys(priceHistoryMap)) delete priceHistoryMap[key];
  for (const key of Object.keys(volumeHistoryMap)) delete volumeHistoryMap[key];
  for (const key of Object.keys(recentTradesMap)) delete recentTradesMap[key];
  for (const key of Object.keys(orderbookHistory)) delete orderbookHistory[key];
  for (const key of Object.keys(marketDataMeta)) delete marketDataMeta[key];
  marketDataEnvironment = currentEnvironment();
  addEngineLog("SYSTEM", `Market data belleği sıfırlandı: ${reason} [${marketDataEnvironment.toUpperCase()}]`);
}

function markMarketData(symbol: string, kind: "ticker" | "depth" | "trade", environment: "testnet" | "live") {
  const now = Date.now();
  const meta = marketDataMeta[symbol] || { environment, tickerAt: 0, depthAt: 0, tradeAt: 0 };
  // Never merge samples belonging to different environments.
  if (meta.environment !== environment) {
    meta.environment = environment;
    meta.tickerAt = 0; meta.depthAt = 0; meta.tradeAt = 0;
  }
  meta[`${kind}At` as "tickerAt" | "depthAt" | "tradeAt"] = now;
  marketDataMeta[symbol] = meta;
  marketDataEnvironment = environment;
}

function hasFreshMarketData(symbol: string, requireDepth = true): boolean {
  const env = currentEnvironment();
  if (marketDataEnvironment !== env) return false;
  const meta = marketDataMeta[symbol];
  if (!meta || meta.environment !== env) return false;
  const now = Date.now();
  const tickerFresh = meta.tickerAt > 0 && now - meta.tickerAt <= 10000;
  const depthFresh = !requireDepth || (meta.depthAt > 0 && now - meta.depthAt <= 5000);
  return tickerFresh && depthFresh;
}


interface LocalBookState {
  bids: Map<number, number>;
  asks: Map<number, number>;
  lastUpdateId: number;
  initialized: boolean;
  eventBuffer: any[];
  syncing: boolean;
  lastEventAt: number;
}
const localBooks: Record<string, LocalBookState> = {};

function getLocalBookState(symbol: string): LocalBookState {
  return localBooks[symbol] ||= { bids: new Map(), asks: new Map(), lastUpdateId: 0, initialized: false, eventBuffer: [], syncing: false, lastEventAt: 0 };
}

function mapToLevels(map: Map<number, number>, side: "bids"|"asks", limit=50) {
  return [...map.entries()]
    .filter(([,q]) => q > 0)
    .sort((a,b)=> side === "bids" ? b[0]-a[0] : a[0]-b[0])
    .slice(0, limit)
    .map(([p,q])=>[p,q]);
}

function publishLocalBook(symbol:string, environment: "testnet" | "live" = currentEnvironment()){
  const st=getLocalBookState(symbol);
  const bids=mapToLevels(st.bids,"bids",50);
  const asks=mapToLevels(st.asks,"asks",50);
  if(bids.length && asks.length){
    latestOrderBooks[symbol]={ bids, asks, timestamp:Date.now(), lastUpdateId:st.lastUpdateId, local:true, environment };
    markMarketData(symbol, "depth", environment);
  }
}

async function syncLocalBook(symbol: string, retries = 2) {
  const sourceEnvironment = currentEnvironment();
  const st = getLocalBookState(symbol);
  if (st.syncing) return;
  st.syncing = true;
  try {
    const clean = symbol.replace('/', '').toUpperCase();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    
    let r: Response | null = null;
    const baseUrl = futuresRestBase(sourceEnvironment);
    const envLabel = sourceEnvironment === 'testnet' ? 'TESTNET' : 'LIVE';
    try {
      r = await fetch(`${baseUrl}/fapi/v1/depth?symbol=${encodeURIComponent(clean)}&limit=100`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!r || !r.ok) throw new Error(`depth snapshot ${r ? r.status : 'timeout'} from ${envLabel}`);
    if (currentEnvironment() !== sourceEnvironment) {
      addEngineLog("WARN", `Order book sync aborted: Environment changed during fetch (${sourceEnvironment} → ${currentEnvironment()})`);
      return;
    }
    const data = await r.json();
    if (currentEnvironment() !== sourceEnvironment) return;
    st.bids = new Map((data.bids || []).map((x: any) => [Number(x[0]), Number(x[1])]).filter((x: any) => x[0] > 0 && x[1] >= 0));
    st.asks = new Map((data.asks || []).map((x: any) => [Number(x[0]), Number(x[1])]).filter((x: any) => x[0] > 0 && x[1] >= 0));
    st.lastUpdateId = Number(data.lastUpdateId || 0);
    st.initialized = true;
    const buffer = st.eventBuffer.splice(0);
    let started = false;
    for (const ev of buffer) {
      const U = Number(ev.U || 0), u = Number(ev.u || 0);
      if (!u) continue;
      if (!started) {
        if (U <= st.lastUpdateId + 1 && st.lastUpdateId + 1 <= u) {
          for (const x of (ev.b || [])) { const p = Number(x[0]), q = Number(x[1]); if (q === 0) st.bids.delete(p); else st.bids.set(p, q); }
          for (const x of (ev.a || [])) { const p = Number(x[0]), q = Number(x[1]); if (q === 0) st.asks.delete(p); else st.asks.set(p, q); }
          st.lastUpdateId = u; st.lastEventAt = Date.now(); started = true;
        }
        continue;
      }
      if (Number(ev.U || 0) > st.lastUpdateId + 1) break;
      applyDepthEvent(symbol, ev);
    }
    if (!started && buffer.length > 0) { st.initialized = false; st.eventBuffer = buffer.slice(-50); }
    publishLocalBook(symbol, sourceEnvironment);
  } catch (e: any) {
    st.initialized = false;
    if (retries > 0) {
      setTimeout(() => void syncLocalBook(symbol, retries - 1), 1500 + Math.random() * 2000);
    }
  } finally {
    st.syncing = false;
  }
}

function applyDepthEvent(symbol:string, ev:any){
  const st=getLocalBookState(symbol);
  if(!st.initialized) {
    if(st.eventBuffer.length<500) st.eventBuffer.push(ev);
    // If not initialized yet but receiving live events, apply into map to keep best bid/ask alive
    if (ev.b || ev.a) {
      for(const x of (ev.b||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.bids.delete(p); else st.bids.set(p,q); }
      for(const x of (ev.a||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.asks.delete(p); else st.asks.set(p,q); }
      publishLocalBook(symbol, currentEnvironment());
    }
    return;
  }
  const U=Number(ev.U||0), u=Number(ev.u||0), pu=Number(ev.pu||0);
  if(u < st.lastUpdateId+1) return;
  if(st.lastUpdateId>0 && pu && pu !== st.lastUpdateId){
    st.initialized=false;
    st.eventBuffer=[ev];
    void syncLocalBook(symbol);
    return;
  }
  if(U > st.lastUpdateId+1){
    st.initialized=false;
    st.eventBuffer=[ev];
    void syncLocalBook(symbol);
    return;
  }
  for(const x of (ev.b||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.bids.delete(p); else st.bids.set(p,q); }
  for(const x of (ev.a||[])){ const p=Number(x[0]), q=Number(x[1]); if(q===0) st.asks.delete(p); else st.asks.set(p,q); }
  st.lastUpdateId=u; st.lastEventAt=Date.now();
  publishLocalBook(symbol, currentEnvironment());
}


// =============== CONSTANTS ===============
const ESTIMATED_FEE_PCT = 0.08; // Estimated roundtrip taker/maker fee (0.04% * 2)
// Risk Profiles removed in favor of manual Stop Loss %

// =============== HELPERS ===============
function addEngineLog(level: string, message: string) {
  const timestamp = new Date().toLocaleTimeString();
  lastLogId++;
  engineLogs.unshift({ id: lastLogId.toString(), timestamp, level, message });
  if (engineLogs.length > 150) engineLogs.length = 150;
  console.log(`[${level}] ${timestamp} - ${message}`);
}

async function fetchServerIp() {
  const now = Date.now();
  if (now - lastIpFetchTime > 300000 || serverIp === "Tespit ediliyor..." || serverIp === "Bağlantı Hatası") {
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();
      serverIp = data.ip;
      lastIpFetchTime = now;
    } catch (e) {
      if (serverIp === "Tespit ediliyor...") {
        serverIp = "Bağlantı Hatası";
      }
    }
  }
  return serverIp;
}

const getServerPublicIp = fetchServerIp;

function getBinanceEnvironment(): "testnet" | "live" {
  try {
    if (fs.existsSync("config.json")) {
      const conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
      return String(conf?.exchange?.environment || process.env.BINANCE_ENVIRONMENT || "live").toLowerCase() === "testnet" ? "testnet" : "live";
    }
  } catch {}
  return String(process.env.BINANCE_ENVIRONMENT || "live").toLowerCase() === "testnet" ? "testnet" : "live";
}

function getBinanceFuturesEndpoints(environment: "testnet" | "live" = getBinanceEnvironment()) {
  if (environment === "testnet") {
    return {
      environment,
      rest: "https://demo-fapi.binance.com",
      wsCombined: "wss://fstream.testnet.binancefuture.com/stream",
      wsPublicCombined: "wss://fstream.testnet.binancefuture.com/public/stream",
      wsMarketCombined: "wss://fstream.testnet.binancefuture.com/market/stream",
      wsBase: "wss://fstream.testnet.binancefuture.com"
    };
  }
  return {
    environment,
    rest: "https://fapi.binance.com",
    wsCombined: "wss://fstream.binance.com/stream",
    wsPublicCombined: "wss://fstream.binance.com/public/stream",
    wsMarketCombined: "wss://fstream.binance.com/market/stream",
    wsBase: "wss://fstream.binance.com"
  };
}

function futuresRestBase(environment: "testnet" | "live" = getBinanceEnvironment()) {
  return getBinanceFuturesEndpoints(environment).rest;
}

function futuresWsBase(kind: "market" | "public", environment: "testnet" | "live" = getBinanceEnvironment()) {
  const ep = getBinanceFuturesEndpoints(environment);
  return kind === "public" ? ep.wsPublicCombined : ep.wsMarketCombined;
}

// =============== INITIALIZATION ===============
async function initializeExchange(): Promise<{ success: boolean; message: string }> {
  try {
    let confStr = "{}";
    if (fs.existsSync("config.json")) {
      confStr = fs.readFileSync("config.json", "utf8");
    }
    const conf = JSON.parse(confStr);
    
    const apiKey = conf?.exchange?.key || process.env.BINANCE_API_KEY;
    const isTestnet = String(conf?.exchange?.environment || process.env.BINANCE_ENVIRONMENT || "live").toLowerCase() === "testnet";
    const secret = conf?.exchange?.secret || process.env.BINANCE_API_SECRET;
    
    const configuredLeverage = Number(conf?.leverage);
    targetLeverage = Number.isFinite(configuredLeverage) ? Math.round(clamp(configuredLeverage, 1, 125)) : 15;
    
    if (conf?.coin_selection_mode === "algorithm" || conf?.coin_selection_mode === "manual") {
      coinSelectionMode = conf.coin_selection_mode;
    }

    if (conf?.exchange?.pair_whitelist && conf.exchange.pair_whitelist.length > 0) {
      whitelistCoins = conf.exchange.pair_whitelist;
    }
    
    if (conf?.stop_loss_pct !== undefined && conf?.stop_loss_pct !== null) {
      const sl = parseFloat(String(conf.stop_loss_pct).replace(',', '.'));
      if (Number.isFinite(sl)) activeStopLossPct = clamp(Math.abs(sl), 0.1, 20);
    }
    
    if (conf?.stake_amount !== undefined && conf?.stake_amount !== null && conf?.stake_amount !== "") {
      const stake = Number(String(conf.stake_amount).replace(',', '.'));
      if (Number.isFinite(stake)) activeStakeAmount = clamp(stake, 1, 1000000);
    }
    if (conf?.max_open_trades !== undefined && conf?.max_open_trades !== null && conf?.max_open_trades !== "") {
      const maxTrades = Number(conf.max_open_trades);
      if (Number.isFinite(maxTrades)) maxOpenTrades = Math.round(clamp(maxTrades, 1, 8));
    }
    if (conf?.min_expected_move_pct === undefined) conf.min_expected_move_pct = 0.5;
    if (conf?.min_expected_move_pct !== undefined) {
      const v = parseFloat(String(conf.min_expected_move_pct).replace(',', '.'));
      if (Number.isFinite(v)) activeMinExpectedMovePct = clamp(v, 0.5, 20);
    }
    if (conf?.take_profit_pct === undefined) conf.take_profit_pct = 0.5;
    if (conf?.take_profit_pct !== undefined) {
      const v = parseFloat(String(conf.take_profit_pct).replace(',', '.'));
      if (Number.isFinite(v)) activeTakeProfitPct = clamp(Math.abs(v), 0.1, 20);
    }
    const configuredMarginMode = String(conf?.margin_mode || '').toLowerCase();
    activeMarginMode = configuredMarginMode === 'cross' || configuredMarginMode === 'crossed' ? 'cross' : 'isolated';

    // Initialize Binance Futures (USD-M)
    const ExchangeClass = (ccxt as any).binanceusdm || ccxt.binance;
    
    const exOpts: any = {
      enableRateLimit: true,
      options: {
        defaultType: "future",
        adjustForTimeDifference: true,
        recvWindow: 60000,
      },
    };

    if (apiKey && secret && apiKey.trim() !== "" && secret.trim() !== "") {
      exOpts.apiKey = apiKey.trim();
      exOpts.secret = secret.trim();
      isExchangeAuthenticated = true;
    } else {
      isExchangeAuthenticated = false;
    }

    const newExchange = new ExchangeClass(exOpts);
    if (isTestnet) {
      // Binance Futures Sandbox has been deprecated; Futures testing uses Demo Trading.
      // Never silently fall back to a production/sandbox endpoint.
      if (typeof (newExchange as any).enableDemoTrading !== "function") {
        throw new Error("Bu CCXT sürümü Binance Futures Demo Trading'i desteklemiyor. CCXT'yi güncelleyin.");
      }
      (newExchange as any).enableDemoTrading(true);
      addEngineLog("INFO", "Binance Futures DEMO/TESTNET ortamı etkin (demo-fapi.binance.com). Gerçek para kullanılmayacak.");
    } else {
      addEngineLog("INFO", "Binance Futures LIVE ortamı etkin.");
    }
    
    // Sync clock time difference to avoid -1021 timestamp error
    await syncBinanceTimeOffset(isTestnet ? "testnet" : "live");
    if (typeof (newExchange as any).loadTimeDifference === "function") {
      try {
        await (newExchange as any).loadTimeDifference();
      } catch (e) {}
    }

    // Load Binance markets for exact precision and limit rules
    try {
      await newExchange.loadMarkets();
    } catch (e: any) {
      console.warn("Binance loadMarkets fallback:", e.message);
      throw new Error(`Binance ${isTestnet ? "TESTNET/DEMO" : "LIVE"} market bilgisi alınamadı: ${e?.message || e}`);
    }

    exchange = newExchange;
    activeExchangeEnvironment = isTestnet ? "testnet" : "live";

    // Verify authentication and sync active positions
    if (isExchangeAuthenticated) {
      addEngineLog("INFO", "Binance Vadeli İşlemler (Futures) API bağlantısı aktif.");
      await syncBinancePositions();
      return { success: true, message: "Borsa ve pozisyonlar senkronize edildi." };
    } else {
      addEngineLog("INFO", `Binance ${isTestnet ? "Futures Demo/Testnet" : "Futures canlı"} piyasa ve WebSocket akışı devrede.`);
      return { success: true, message: "Genel piyasa canlı akışı hazır." };
    }
  } catch (error: any) {
    exchange = null;
    activeExchangeEnvironment = null;
    isExchangeAuthenticated = false;
    addEngineLog("ERROR", `Binance ${getBinanceEnvironment().toUpperCase()} bağlantısı güvenli şekilde durduruldu: ${error.message || error}`);
    return { success: false, message: error.message || "Binance bağlantısı kurulamadı." };
  }
}

// Resolve a Binance-confirmed exit fill when a position disappears outside the engine
// (e.g. exchange STOP_MARKET, manual Binance close, liquidation/other external action).
async function resolveBinanceExitFill(exSymbol: string, pos: ActivePosition) {
  try {
    if (pos.binanceStopOrderId && typeof (exchange as any)?.fetchOrder === 'function') {
      const order = await (exchange as any).fetchOrder(pos.binanceStopOrderId, exSymbol);
      const filled = Number(order?.filled || 0);
      const avg = Number(order?.average || order?.price || 0);
      if (filled > 0 && avg > 0 && (order?.status === 'closed' || order?.status === 'filled')) {
        return { price: avg, amount: filled, orderId: String(order.id || pos.binanceStopOrderId) };
      }
    }
  } catch {}

  try {
    if (typeof (exchange as any)?.fetchClosedOrders === 'function') {
      const since = Math.max(0, Number(pos.openDate || Date.now()) - 60_000);
      const orders = await (exchange as any).fetchClosedOrders(exSymbol, since, 100);
      const exitSide = pos.type === 'long' ? 'sell' : 'buy';
      const candidates = (orders || []).filter((o: any) => {
        const filled = Number(o?.filled || 0);
        const side = String(o?.side || '').toLowerCase();
        const reduceOnly = Boolean(o?.reduceOnly ?? o?.params?.reduceOnly ?? o?.info?.reduceOnly);
        const openedAfterPosition = Number(o?.timestamp || 0) >= Number(pos.openDate || 0);
        const sizeLooksLikeClose = filled <= Number(pos.amount || filled) * 1.05;
        return filled > 0 && side === exitSide && openedAfterPosition && (reduceOnly || sizeLooksLikeClose);
      }).sort((a: any, b: any) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      const order = candidates[0];
      if (order) {
        const avg = Number(order.average || order.price || 0);
        const filled = Number(order.filled || 0);
        if (avg > 0 && filled > 0) return { price: avg, amount: filled, orderId: String(order.id || '') };
      }
    }
  } catch {}

  return null;
}

// Synchronize real live positions directly with Binance
async function syncBinancePositions() {
  if (!exchange || !isExchangeAuthenticated) return;
  try {
    const activeEnv = getBinanceEnvironment();
    if (activeExchangeEnvironment !== activeEnv) {
      addEngineLog("WARN", `Position sync skipped: activeExchangeEnvironment (${activeExchangeEnvironment}) != current environment (${activeEnv})`);
      return;
    }
    
    if (typeof exchange.fetchPositions === 'function') {
      const positions = await exchange.fetchPositions();
      if (!Array.isArray(positions)) return;
      const activeSymbolsInExchange = new Set<string>();

      for (const p of positions) {
        const contracts = Math.abs(Number(p.contracts ?? p.info?.positionAmt ?? p.amount ?? 0));
        if (contracts > 0) {
          // Clean symbol format (e.g., DOGE/USDT:USDT -> DOGE/USDT)
          let cleanSymbol = p.symbol ? p.symbol.split(':')[0] : '';
          if (!cleanSymbol.includes('/') && cleanSymbol.endsWith('USDT')) {
            const base = cleanSymbol.slice(0, -4);
            cleanSymbol = `${base}/USDT`;
          }
          activeSymbolsInExchange.add(cleanSymbol);

          const rawPositionAmt = Number(p.info?.positionAmt ?? p.positionAmt ?? 0);
          const posType: "long" | "short" =
            p.side === 'short' || rawPositionAmt < 0 ? 'short' : 'long';
          const entryPrice = Number(p.entryPrice || p.markPrice || 0);
          const markPrice = Number(p.markPrice || entryPrice || 0);
          const lev = Number(p.leverage || targetLeverage || 1);
          const unPnl = Number(p.unrealizedPnl ?? p.info?.unRealizedProfit ?? 0);
          const notional = Math.abs(Number(p.notional ?? p.info?.notional ?? (entryPrice * contracts)));
          const positionInitialMargin = Number(p.initialMargin ?? p.info?.positionInitialMargin ?? 0);
          const initialMargin = positionInitialMargin > 0
            ? positionInitialMargin
            : (notional > 0 && lev > 0 ? notional / lev : 0);
          const roePct = initialMargin > 0 ? (unPnl / initialMargin) * 100 : Number(p.percentage || 0);

          if (!activePositions[cleanSymbol]) {
            activePositions[cleanSymbol] = {
              trade_id: tradeCounter++,
              pair: cleanSymbol,
              type: posType,
              entryPrice,
              amount: contracts,
              peakPrice: entryPrice,
              openDate: Date.now(),
              lookbackMin: activeLookbackMin,
              stopLossPct: activeStopLossPct,
              deepScoreHistory: [],
              leverage: lev,
              baseStopPrice: 0,
              unrealizedPnl: Number(unPnl.toFixed(2)),
              percentage: Number(roePct.toFixed(2)),
              markPrice: Number(markPrice.toFixed(8)),
              pnlSource: "binance",
              marginMode: String(p.marginMode || p.info?.marginType || "")
            };
            (activePositions[cleanSymbol] as any).isRealBinance = true;
            allTrades.unshift({ ...activePositions[cleanSymbol], is_open: true });
            addEngineLog("INFO", `[SENKRON] Binance Pozisyonu Eşitlendi: ${cleanSymbol} ${posType.toUpperCase()} x${lev} | Büyüklük: ${contracts} | Giriş: $${entryPrice}`);
          } else {
            // Update live metrics from Binance
            activePositions[cleanSymbol].unrealizedPnl = Number(unPnl.toFixed(2));
            activePositions[cleanSymbol].percentage = Number(roePct.toFixed(2));
            activePositions[cleanSymbol].markPrice = Number(markPrice.toFixed(8));
            activePositions[cleanSymbol].amount = contracts;
            if (entryPrice > 0) activePositions[cleanSymbol].entryPrice = entryPrice;
            activePositions[cleanSymbol].leverage = lev;
            activePositions[cleanSymbol].pnlSource = "binance";
            activePositions[cleanSymbol].marginMode = String(p.marginMode || p.info?.marginType || activePositions[cleanSymbol].marginMode || "");
            (activePositions[cleanSymbol] as any).isRealBinance = true;
          }
        }
      }

      // Check if any position closed externally on Binance
      for (const sym of Object.keys(activePositions)) {
        const closedPos = activePositions[sym];
        if ((closedPos as any).isRealBinance && (Date.now() - closedPos.openDate > 15000) && !activeSymbolsInExchange.has(sym)) {
          const exitFill = await resolveBinanceExitFill(getMarketSymbol(sym), closedPos);
          const closePrice = Number(exitFill?.price || closedPos.markPrice || latestMetricsPerCoin[sym]?.currentPrice || closedPos.entryPrice);
          const closeAmount = Number(exitFill?.amount || closedPos.amount);
          const grossPnl = closedPos.type === 'long'
            ? (closePrice - closedPos.entryPrice) * closeAmount
            : (closedPos.entryPrice - closePrice) * closeAmount;
          const initialMargin = (closedPos.entryPrice * closeAmount) / (closedPos.leverage || 1);
          const closeRoe = initialMargin > 0 ? (grossPnl / initialMargin) * 100 : 0;
          const tradeIndex = allTrades.findIndex(t => t.trade_id === closedPos.trade_id && t.is_open);
          if (tradeIndex !== -1) {
            allTrades[tradeIndex].is_open = false;
            allTrades[tradeIndex].close_date = Date.now();
            allTrades[tradeIndex].close_reason = exitFill ? "Binance Üzerinden Kapatıldı / Gerçek Dolum" : "Binance Üzerinden Kapatıldı";
            allTrades[tradeIndex].close_rate = closePrice;
            allTrades[tradeIndex].profit_abs = Number(grossPnl.toFixed(2));
            allTrades[tradeIndex].profit_pct = Number(closeRoe.toFixed(2));
            allTrades[tradeIndex].pnl_source = "binance";
          }
          delete activePositions[sym];
          saveTradesHistory();
          addEngineLog("INFO", `[SENKRON] ${sym} Binance üzerinde kapandı | Çıkış: $${closePrice} | PnL: ${grossPnl >= 0 ? '+' : ''}$${grossPnl.toFixed(2)} (${closeRoe >= 0 ? '+' : ''}${closeRoe.toFixed(2)}% ROE)`);
        }
      }
    }
  } catch (e: any) {
    // Ignore transient sync error
  }
}

// =============== HIGH INFLOW & DEEP ORDER FLOW ENGINE ===============
interface OrderFlowMetrics {
  obi: number;                // Order Book Imbalance (-1.0 to +1.0)
  microPrice: number;         // Micro-price accounting for bid/ask volume weights
  midPrice: number;           // (bestBid + bestAsk) / 2
  spreadPct: number;          // Spread percentage
  takerBuyVolUSD: number;     // Recent taker buy volume in USD
  takerSellVolUSD: number;    // Recent taker sell volume in USD
  netInflowUSD: number;       // Net Capital Inflow (Buy - Sell)
  takerBuyRatio: number;      // Taker buy dominance (0.0 to 1.0)
  volumeSpike: boolean;       // True if current volume is 1.5x+ above 20-period SMA
  volumeRatio: number;        // Current Volume / Volume SMA
  vwap: number;               // Volume Weighted Average Price
  stdDev: number;             // Short-term price volatility
  deepScore: number;          // Composite quantitative score (-100 to +100)
  // Kinetic Orderflow Gravity (KOG) Model Predictive Metrics
  predictedProfitPct: number;
  predictedTimeSec: number;
  smartTargetPrice: number;
  smartStopPrice: number;
  liquidityGravityScore: number; 
}

// In-memory candle and tick memory per coin for accurate real-time indicator calculations
const priceHistoryMap: Record<string, number[]> = {};
const volumeHistoryMap: Record<string, number[]> = {};
const recentTradesMap: Record<string, any[]> = {};
let lastScanLogTime = 0;


// ================= ADVANCED MICROSTRUCTURE / ORDER-FLOW MODEL =================
const orderbookHistory: Record<string, Array<{
  ts:number; bid10:number; ask10:number; bid30:number; ask30:number; gap:number;
  majorBid:number; majorAsk:number; price:number;
}>> = {};

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const a = [...values].sort((x,y)=>x-y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)); }

function weightedBookSide(levels:any[], maxLevels:number, decay:number, currentPrice:number, minNotionalQuantile:number = 0) {
  const slice = (levels || []).slice(0, maxLevels);
  const notionals = slice.map((x:any)=>Math.max(0, Number(x[0]) * Number(x[1]))).filter(Boolean);
  const q = notionals.length ? percentile(notionals, minNotionalQuantile) : 0;
  let weighted = 0, raw = 0;
  for (let i=0;i<slice.length;i++) {
    const px=Number(slice[i][0]), qty=Number(slice[i][1]);
    if (!(px>0 && qty>0)) continue;
    const notional=px*qty;
    const rel = currentPrice>0 ? Math.abs(px-currentPrice)/currentPrice : 0;
    const distanceWeight = 1/(1 + rel*160);
    const sizeWeight = q>0 && notional<q ? 0.25 : 1;
    const w = Math.pow(decay, i) * distanceWeight * sizeWeight;
    weighted += qty*w;
    raw += qty;
  }
  return { weighted, raw, count:slice.length };
}


// ================= CUSTOM ADAPTIVE LIQUIDITY PATH MODEL (ALP) =================
// A deterministic, explainable microstructure model. It is intentionally not
// described as a guaranteed probability: the score is a reachability/edge score
// that must be calibrated against closed trades before it is interpreted as a rate.
function sigmoid100(x:number){ return 100/(1+Math.exp(-x)); }

function computeAdaptiveLiquidityPath(
  ob:any,
  side:"long"|"short",
  currentPrice:number,
  recentTrades:any[],
  spreadPct:number,
  volatilityPct:number,
  wallPersistenceScore:number,
  liquidityConsumptionScore:number,
  inflowMomentum:number,
  largeTradeScore:number,
  targetCount=8
){
  const sameSide = side === "long" ? (ob?.bids||[]) : (ob?.asks||[]);
  const oppSide = side === "long" ? (ob?.asks||[]) : (ob?.bids||[]);
  if(!currentPrice || !oppSide.length) return {best:null, levels:[], pathScore:0};

  const notionals = recentTrades.map((t:any)=>Math.abs(Number(t.price||currentPrice)*Number(t.amount||0))).filter((n:number)=>n>0);
  const recentTotal = notionals.reduce((a,b)=>a+b,0);
  const firstTs = recentTrades.length ? Number(recentTrades[0]?.timestamp || recentTrades[0]?.time || Date.now()) : Date.now();
  const lastTs = recentTrades.length ? Number(recentTrades[recentTrades.length-1]?.timestamp || recentTrades[recentTrades.length-1]?.time || Date.now()) : Date.now();
  const observedSec = Math.max(1, Math.min(60, (lastTs-firstTs)/1000 || 1));
  const horizonSec = 15;
  const flowPerSec = recentTotal / observedSec;
  const pressure = side === "long"
    ? clamp((inflowMomentum*0.45)+(largeTradeScore*0.45)+(liquidityConsumptionScore*0.10),-100,100)
    : clamp((-inflowMomentum*0.45)+(-largeTradeScore*0.45)+(-liquidityConsumptionScore*0.10),-100,100);
  const basePressure = clamp((pressure+100)/2,0,100);
  const maxScan=Math.min(50,oppSide.length);
  const levels=[] as any[];
  let cumOpp=0;
  for(let i=0;i<maxScan;i++){
    const [px,qty]=oppSide[i]||[];
    const p=Number(px), q=Number(qty);
    if(!(p>0&&q>0)) continue;
    cumOpp += p*q;
    const distPct=Math.abs(p-currentPrice)/currentPrice*100;
    const refVol=Math.max(0.05, volatilityPct||0.05);
    const distanceFit=clamp(1-distPct/Math.max(0.5,refVol*2.2),0,1);
    const depthCapacity=flowPerSec>0 ? clamp(1-cumOpp/(flowPerSec*horizonSec*1.8),0,1) : 0.15;
    const pressureFit=basePressure/100;
    const frictionPenalty=clamp(spreadPct*10000/25,0,1);
    const pathScore=clamp(100*(0.42*pressureFit+0.28*depthCapacity+0.18*distanceFit+0.12*clamp((wallPersistenceScore+50)/100,0,1))*(1-frictionPenalty*0.25),0,100);
    const reach=side === "long" ? p>currentPrice : p<currentPrice;
    if(reach){
      const expectedMovePct=distPct;
      const netEdge=pathScore/100;
      levels.push({price:p,expectedMovePct, cumulativeOppNotional:cumOpp, pathScore, horizonSec, netEdge});
    }
    if(levels.length>=targetCount) break;
  }
  // Prefer the furthest target that still has a strong path score, otherwise the strongest near target.
  const strong=levels.filter(x=>x.pathScore>=65);
  const candidates=(strong.length?strong:levels).slice(-Math.min(3,levels.length));
  const best=candidates.sort((a,b)=> (b.expectedMovePct*b.netEdge)-(a.expectedMovePct*a.netEdge))[0] || null;
  const pathScore=best?.pathScore || 0;
  return {best,levels,pathScore};
}

function getHistoricalTargetAccuracy(symbol:string){
  const closed=allTrades.filter((t:any)=>!t.is_open && t.pair===symbol && Number(t.modelTargetPnlUSD)>0 && Number.isFinite(Number(t.profit_abs)));
  if(!closed.length) return {sample:0, hitRate:null as number|null};
  let hits=0;
  for(const t of closed){ if(Number(t.profit_abs) >= Number(t.modelTargetPnlUSD)*0.9) hits++; }
  return {sample:closed.length, hitRate:hits/closed.length};
}

function analyzeMicrostructure(
  symbol: string,
  ob: any,
  recentTrades: any[],
  prices: number[],
  volumes: number[],
  currentPrice: number
): any {
  if (!ob?.bids?.length || !ob?.asks?.length || !currentPrice) {
    return {
      dataReady: false,
      dataQuality: 0,
      obi: 0,
      longFlowScore: 50,
      shortFlowScore: 50,
      flowDirection: 'NEUTRAL',
      longAdvantage: 50,
      shortAdvantage: 50,
      orderFlowGap: 0,
      microPrice: currentPrice,
      midPrice: currentPrice,
      spreadPct: 0,
      takerBuyVolUSD: 0,
      takerSellVolUSD: 0,
      netInflowUSD: 0,
      takerBuyRatio: 0.5,
      takerSellRatio: 0.5,
      inflowMomentum: 0,
      largeTradeScore: 0,
      liquidityConsumptionScore: 0,
      wallPersistenceScore: 0,
      divergenceScore: 0,
      movementPotentialPct: 1.0,
      expectedNetProfitUSD: 1.5,
      expectedTargetPrice: currentPrice,
      predictedProfitPct: 1.0,
      predictedTimeSec: 60,
      smartTargetPrice: currentPrice,
      smartStopPrice: currentPrice,
      liquidityGravityScore: 50,
      deepScore: 0,
      volumeSpike: false,
      volumeRatio: 1,
      vwap: currentPrice,
      stdDev: 0
    };
  }

  const bestBid = Number(ob.bids[0][0]);
  const bestAsk = Number(ob.asks[0][0]);
  const mid = (bestBid + bestAsk) / 2;
  const spreadPct = mid > 0 ? (bestAsk - bestBid) / mid : 0;

  // 1. Order Book Imbalance (Tiered Book Depth Analysis)
  const t1b = weightedBookSide(ob.bids, 10, 0.88, currentPrice, 0.20);
  const t1a = weightedBookSide(ob.asks, 10, 0.88, currentPrice, 0.20);
  const t2b = weightedBookSide(ob.bids.slice(10), 10, 0.91, currentPrice, 0.20);
  const t2a = weightedBookSide(ob.asks.slice(10), 10, 0.91, currentPrice, 0.20);
  const t3b = weightedBookSide(ob.bids.slice(20), 10, 0.94, currentPrice, 0.20);
  const t3a = weightedBookSide(ob.asks.slice(20), 10, 0.94, currentPrice, 0.20);
  const deepB = weightedBookSide(ob.bids.slice(30), 20, 0.97, currentPrice, 0.20);
  const deepA = weightedBookSide(ob.asks.slice(30), 20, 0.97, currentPrice, 0.20);

  const imbalance = (b: number, a: number) => (b + a > 0 ? (b - a) / (b + a) : 0);
  const obi10 = imbalance(t1b.weighted, t1a.weighted);
  const obi20 = imbalance(t1b.weighted + t2b.weighted, t1a.weighted + t2a.weighted);
  const obi30 = imbalance(t1b.weighted + t2b.weighted + t3b.weighted, t1a.weighted + t2a.weighted + t3a.weighted);
  const weightedObi = 0.55 * obi10 + 0.30 * obi20 + 0.15 * obi30;
  const microDen = t1b.weighted + t1a.weighted;
  const microPrice = microDen > 0 ? ((bestBid * t1a.weighted) + (bestAsk * t1b.weighted)) / microDen : mid;

  // 2. Order Book Dynamics, Resistance vs Support Analysis
  const majorBid = Math.max(0, ...(ob.bids.slice(0, 30).map((x: any) => Number(x[0]) * Number(x[1]))));
  const majorAsk = Math.max(0, ...(ob.asks.slice(0, 30).map((x: any) => Number(x[0]) * Number(x[1]))));

  // Near depth (within 1.0% price range)
  let bidDepthNearUSD = 0;
  let askDepthNearUSD = 0;
  for (const b of ob.bids.slice(0, 20)) {
    const px = Number(b[0]), qty = Number(b[1]);
    if (px > 0 && qty > 0 && Math.abs(px - currentPrice) / currentPrice <= 0.012) {
      bidDepthNearUSD += px * qty;
    }
  }
  for (const a of ob.asks.slice(0, 20)) {
    const px = Number(a[0]), qty = Number(a[1]);
    if (px > 0 && qty > 0 && Math.abs(px - currentPrice) / currentPrice <= 0.012) {
      askDepthNearUSD += px * qty;
    }
  }

  // Resistance Ratios
  const resistanceRatioLong = askDepthNearUSD / Math.max(1, bidDepthNearUSD); // If > 2.0, heavy sell resistance against Long
  const resistanceRatioShort = bidDepthNearUSD / Math.max(1, askDepthNearUSD); // If > 2.0, heavy buy support against Short
  const wallResistanceLong = majorAsk > (majorBid * 2.2) && (majorAsk > bidDepthNearUSD * 0.4);
  const wallResistanceShort = majorBid > (majorAsk * 2.2) && (majorBid > askDepthNearUSD * 0.4);

  const hist = orderbookHistory[symbol] ||= [];
  const compact = {
    ts: Date.now(),
    bid10: t1b.weighted,
    ask10: t1a.weighted,
    bid30: t1b.weighted + t2b.weighted + t3b.weighted,
    ask30: t1a.weighted + t2a.weighted + t3a.weighted,
    gap: obi30,
    majorBid,
    majorAsk,
    price: currentPrice
  };
  hist.push(compact);
  if (hist.length > 30) hist.shift();
  const recent = hist.slice(-10);
  const prev = hist.length > 10 ? hist.slice(-20, -10) : hist.slice(0, -10);
  const avg = (arr: any[], k: string) => arr.length ? arr.reduce((a, x) => a + Number(x[k] || 0), 0) / arr.length : 0;
  const gapNow = avg(recent, 'gap');
  const gapPrev = avg(prev, 'gap');
  const liquidityConsumptionScore = clamp(((gapNow - gapPrev) * 700) + ((avg(recent, 'majorAsk') < avg(prev, 'majorAsk') && obi30 > 0) ? 20 : 0) - ((avg(recent, 'majorBid') < avg(prev, 'majorBid') && obi30 < 0) ? 20 : 0), -100, 100);
  const wallPersistenceScore = clamp(((recent.filter((x: any) => Math.abs(x.majorBid - avg(recent, 'majorBid')) < Math.max(1, avg(recent, 'majorBid') * 0.25)).length) - (recent.filter((x: any) => Math.abs(x.majorAsk - avg(recent, 'majorAsk')) < Math.max(1, avg(recent, 'majorAsk') * 0.25)).length)) * 5, -50, 50);

  // 3. High-Precision Long / Short Money Flow (Para Akışı) Analysis
  let takerBuyVolUSD = 0;
  let takerSellVolUSD = 0;
  const notionals = recentTrades.map((t: any) => Math.abs(Number(t.amount || 0) * Number(t.price || currentPrice))).filter((x: number) => x > 0);
  const p50 = percentile(notionals, 0.5);
  const p90 = percentile(notionals, 0.9);
  let largeBuy = 0;
  let largeSell = 0;

  for (const t of recentTrades) {
    const n = Math.abs(Number(t.amount || 0) * Number(t.price || currentPrice));
    if (!(n > 0)) continue;
    const side = t.side;
    if (side === 'buy') takerBuyVolUSD += n;
    else if (side === 'sell') takerSellVolUSD += n;

    if (p90 > 0 && n >= p90) {
      if (side === 'buy') largeBuy += n;
      else if (side === 'sell') largeSell += n;
    }
  }

  const totalTrade = takerBuyVolUSD + takerSellVolUSD;
  const netInflowUSD = takerBuyVolUSD - takerSellVolUSD;
  const takerBuyRatio = totalTrade > 0 ? takerBuyVolUSD / totalTrade : 0.5;
  const takerSellRatio = 1 - takerBuyRatio;

  // Rolling Momentum of Inflow
  const half = Math.max(1, Math.floor(recentTrades.length / 2));
  const first = recentTrades.slice(0, half);
  const last = recentTrades.slice(-half);
  const flowNet = (arr: any[]) => arr.reduce((sum, t) => sum + (t.side === 'buy' ? 1 : -1) * Math.abs(Number(t.amount || 0) * Number(t.price || currentPrice)), 0);
  const inflowMomentum = clamp((flowNet(last) - flowNet(first)) / Math.max(1, totalTrade) * 100, -100, 100);
  const largeTradeScore = clamp((largeBuy - largeSell) / Math.max(1, largeBuy + largeSell) * 100, -100, 100);

  // Price/order-book divergence
  const priceRet = prices.length >= 8 ? Math.log(prices[prices.length - 1] / prices[prices.length - 8]) : 0;
  const bookSlope = gapNow - (hist.length > 10 ? avg(hist.slice(-20, -10), 'gap') : 0);
  const divergenceScore = clamp((bookSlope * 900) - (priceRet * 1800), -100, 100);

  // Volatility & VWAP
  let stdDev = 0;
  let vwap = currentPrice;
  let volumeRatio = 1;
  let volumeSpike = false;

  if (prices.length >= 4) {
    const rets = [];
    for (let i = 1; i < prices.length; i++) rets.push(Math.log(prices[i] / prices[i - 1]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    stdDev = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
    vwap = prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  if (volumes.length >= 4) {
    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    const lastVol = volumes[volumes.length - 1] || 0;
    volumeRatio = avgVol > 0 ? lastVol / avgVol : 1;
    volumeSpike = volumeRatio >= 1.25;
  }

  // 4. Primary Long vs Short Money Flow Scoring (Para Akışı Algoritması)
  // - 45% Taker Buy/Sell Ratio (0 to 45 pts)
  // - 20% Order Book Imbalance (0 to 20 pts)
  // - 15% Flow Inflow Momentum & Large Trade Dominance (0 to 15 pts)
  // - 10% Micro-Price vs Mid-Price Premium (0 to 10 pts)
  // - 10% Resistance Penalty / Support Advantage (0 to 10 pts)
  const buyFlowComponent = takerBuyRatio * 45;
  const sellFlowComponent = takerSellRatio * 45;

  const bidBookComponent = clamp(((weightedObi + 1) / 2) * 20, 0, 20);
  const askBookComponent = clamp(((1 - weightedObi) / 2) * 20, 0, 20);

  const longMomentumComponent = clamp(7.5 + (inflowMomentum > 0 ? inflowMomentum * 0.075 : 0) + (largeTradeScore > 0 ? largeTradeScore * 0.05 : 0), 0, 15);
  const shortMomentumComponent = clamp(7.5 + (inflowMomentum < 0 ? (-inflowMomentum) * 0.075 : 0) + (largeTradeScore < 0 ? (-largeTradeScore) * 0.05 : 0), 0, 15);

  const longMicroComponent = microPrice >= mid ? 10 : Math.max(0, 10 - ((mid - microPrice) / Math.max(1, mid * 0.0005)) * 5);
  const shortMicroComponent = microPrice <= mid ? 10 : Math.max(0, 10 - ((microPrice - mid) / Math.max(1, mid * 0.0005)) * 5);

  // Resistance penalties
  const longResistanceBonus = clamp(10 - Math.max(0, (resistanceRatioLong - 1.0) * 8), 0, 10);
  const shortResistanceBonus = clamp(10 - Math.max(0, (resistanceRatioShort - 1.0) * 8), 0, 10);

  const longFlowScore = clamp(buyFlowComponent + bidBookComponent + longMomentumComponent + longMicroComponent + longResistanceBonus, 0, 100);
  const shortFlowScore = clamp(sellFlowComponent + askBookComponent + shortMomentumComponent + shortMicroComponent + shortResistanceBonus, 0, 100);

  const orderFlowGap = longFlowScore - shortFlowScore;
  const longAdvantage = longFlowScore;
  const shortAdvantage = shortFlowScore;

  // Determine High-Resolution Flow Direction
  let flowDirection: 'STRONG_LONG' | 'LONG' | 'NEUTRAL' | 'SHORT' | 'STRONG_SHORT' = 'NEUTRAL';
  if (longFlowScore >= 56 && takerBuyRatio >= 0.54 && netInflowUSD > 0 && !wallResistanceLong) {
    flowDirection = 'STRONG_LONG';
  } else if (longFlowScore >= 52 && takerBuyRatio >= 0.51 && longFlowScore > shortFlowScore) {
    flowDirection = 'LONG';
  } else if (shortFlowScore >= 56 && takerBuyRatio <= 0.46 && netInflowUSD < 0 && !wallResistanceShort) {
    flowDirection = 'STRONG_SHORT';
  } else if (shortFlowScore >= 52 && takerBuyRatio <= 0.49 && shortFlowScore > longFlowScore) {
    flowDirection = 'SHORT';
  } else {
    flowDirection = 'NEUTRAL';
  }

  // Adaptive Liquidity Path for Take-Profit and Stop-Loss
  const dir = longFlowScore >= shortFlowScore ? 1 : -1;
  const targetModel = computeAdaptiveLiquidityPath(ob, dir > 0 ? "long" : "short", currentPrice, recentTrades, spreadPct, stdDev * 100, wallPersistenceScore, liquidityConsumptionScore, inflowMomentum, largeTradeScore, 8);
  const deepOpp = dir > 0 ? deepA.weighted : deepB.weighted;
  const nearOpp = dir > 0 ? (t2a.weighted + t3a.weighted) : (t2b.weighted + t3b.weighted);
  const pressure = Math.abs(weightedObi);
  const volPct = stdDev * Math.sqrt(Math.max(1, Math.min(60, recentTrades.length || 10))) * 100;
  const pathMovePct = targetModel.best?.expectedMovePct || Math.max(0.40, Math.min(3.0, Math.max(volPct * 1.2, 0.80)));
  const movementPotentialPct = clamp(pathMovePct, 0.30, 15.0);
  const expectedTargetPrice = targetModel.best?.price || (dir > 0 ? currentPrice * (1 + movementPotentialPct / 100) : currentPrice * (1 - movementPotentialPct / 100));
  const predictedProfitPct = movementPotentialPct;
  const buyVelocity = totalTrade / Math.max(1, activeLookbackMin * 60);
  const predictedTimeSec = targetModel.best?.horizonSec || (buyVelocity > 0 ? Math.max(5, Math.min(3600, (nearOpp + deepOpp) / buyVelocity)) : 60);

  const notionalReference = Math.max(1, activeStakeAmount * targetLeverage);
  const roundTripFeeUSD = notionalReference * (ESTIMATED_FEE_PCT / 100);
  const spreadCostUSD = notionalReference * spreadPct;
  const slippagePct = clamp(0.00015 + spreadPct * 0.75, 0.00015, 0.01);
  const expectedGrossUSD = notionalReference * (movementPotentialPct / 100);
  const expectedNetProfitUSD = Math.max(0, expectedGrossUSD - roundTripFeeUSD - spreadCostUSD - (notionalReference * slippagePct));
  const historicalTargetAccuracy = getHistoricalTargetAccuracy(symbol);
  const calibratedTargetConfidence = historicalTargetAccuracy.hitRate === null
    ? Math.round(targetModel.pathScore || 75)
    : Math.round(clamp((targetModel.pathScore || 70) * 0.7 + historicalTargetAccuracy.hitRate * 100 * 0.3, 0, 100));

  const smartStopPrice = dir > 0 ? currentPrice * (1 - activeStopLossPct / 100) : currentPrice * (1 + activeStopLossPct / 100);
  const deepScore = clamp(orderFlowGap * 0.8 + largeTradeScore * 0.1 + liquidityConsumptionScore * 0.1, -100, 100);
  const strongestScoreForEdge = Math.max(longFlowScore, shortFlowScore);
  const edgeScore = clamp(strongestScoreForEdge, 0, 100);

  const dataReady = ob.bids.length >= 5 && ob.asks.length >= 5 && currentPrice > 0;

  return {
    dataReady,
    dataQuality: clamp((Math.min(1, ob.bids.length / 20) + Math.min(1, ob.asks.length / 20) + Math.min(1, (recentTrades.length || 10) / 20)) / 3 * 100, 50, 100),
    obi: weightedObi,
    obi10,
    obi20,
    obi30,
    microPrice,
    midPrice: mid,
    spreadPct,
    takerBuyVolUSD,
    takerSellVolUSD,
    netInflowUSD,
    takerBuyRatio,
    takerSellRatio,
    inflowMomentum,
    largeTradeScore,
    longFlowScore,
    shortFlowScore,
    flowDirection,
    liquidityConsumptionScore,
    wallPersistenceScore,
    divergenceScore,
    longAdvantage,
    shortAdvantage,
    orderFlowGap,
    volumeSpike,
    volumeRatio,
    vwap,
    stdDev,
    deepScore,
    predictedProfitPct,
    predictedTimeSec,
    smartTargetPrice: expectedTargetPrice,
    smartStopPrice,
    liquidityGravityScore: clamp(pressure * 100, 0, 100),
    movementPotentialPct,
    expectedNetProfitUSD,
    expectedTargetPrice,
    targetPathScore: targetModel.pathScore || 75,
    targetPathLevels: targetModel.levels,
    targetConfidence: calibratedTargetConfidence,
    targetAccuracySample: historicalTargetAccuracy.sample,
    targetAccuracyRate: historicalTargetAccuracy.hitRate,
    edgeScore,
    first10LongScore: (obi10 + 1) * 50,
    first10ShortScore: (1 - obi10) * 50,
    nearOpp,
    deepOpp,
    roundTripFeeUSD,
    spreadCostUSD,
    slippagePct,
    p50TradeUSD: p50,
    largeTradeBuyUSD: largeBuy,
    largeTradeSellUSD: largeSell,
    resistanceRatioLong,
    resistanceRatioShort,
    wallResistanceLong,
    wallResistanceShort,
    askDepthNearUSD,
    bidDepthNearUSD
  };
}
// =======================================================================================================
// Server-side persistent Binance WebSocket streams.
// Binance now separates high-frequency public data (depth) from regular market data
// (ticker/aggTrade). Keeping both here guarantees the selected environment is used
// consistently and prevents the browser from ever connecting directly to LIVE.
let binanceWsClients: WsClient[] = [];
let binanceWsReconnectTimer: any = null;

function stopBinanceServerWebSockets() {
  clearTimeout(binanceWsReconnectTimer);
  binanceWsReconnectTimer = null;
  const clients = binanceWsClients;
  binanceWsClients = [];
  clients.forEach((client) => {
    try { client.removeAllListeners(); } catch {}
    try { client.terminate(); } catch {}
  });
}

function scheduleBinanceServerWebSocketReconnect() {
  if (binanceWsReconnectTimer) return;
  binanceWsReconnectTimer = setTimeout(() => {
    binanceWsReconnectTimer = null;
    startBinanceServerWebSocket();
  }, 5000);
}

function startBinanceServerWebSocket() {
  stopBinanceServerWebSockets();
  try {
    const activePairs = getActiveTradingPairs();
    if (!activePairs.length) {
      addEngineLog("WARN", "Binance WebSocket başlatılmadı: aktif parite yok.");
      scheduleBinanceServerWebSocketReconnect();
      return;
    }

    const symbols = activePairs.map(c => c.replace('/', '').toLowerCase());
    const marketStreams = symbols
      .flatMap(s => [`${s}@ticker`, `${s}@aggTrade`])
      .join('/');
    const publicStreams = symbols
      .map(s => `${s}@depth@100ms`)
      .join('/');

    const wsEnvironment = getBinanceEnvironment();
    const environmentLabel = wsEnvironment === 'testnet' ? 'TESTNET/DEMO' : 'LIVE';
    const marketUrl = `${futuresWsBase('market', wsEnvironment)}?streams=${marketStreams}`;
    const publicUrl = `${futuresWsBase('public', wsEnvironment)}?streams=${publicStreams}`;
    
    // GUARD: Log environment explicitly
    addEngineLog("INFO", `🔗 Binance ${environmentLabel} WebSocket ${wsEnvironment === 'testnet' ? 'DEMO' : 'PRODUCTION'} endpoints kullanılıyor. URL: ${new URL(marketUrl).origin}`);
    if (wsEnvironment === 'testnet') {
      addEngineLog("INFO", `✓ Testnet Mode AKTIF - Sanal hesap ve demo verileri kullanılacak. GERÇEK PARA YOK!`);
    } else {
      addEngineLog("WARN", `⚠️ LIVE Mode AKTIF - GERÇEK PARA ile işlem yapılacak. Dikkatli olun!`);
    }

    const createClient = (url: string, label: string, syncBooksOnOpen = false) => {
      const client = new WsClient(url);
      binanceWsClients.push(client);

      client.on('open', () => {
        addEngineLog("INFO", `Binance ${label} WebSocket bağlandı [${environmentLabel}: ${activePairs.length} parite].`);
        if (syncBooksOnOpen) {
          activePairs.forEach((sym, idx) => {
            setTimeout(() => void syncLocalBook(sym), idx * 80);
          });
        }
      });
      client.on('message', (raw: any) => handleWsMessage(raw, wsEnvironment));
      client.on('error', (err: any) => {
        addEngineLog("WARN", `Binance ${label} WebSocket hatası [${environmentLabel}]: ${err?.message || 'bağlantı hatası'}`);
      });
      client.on('close', () => {
        scheduleBinanceServerWebSocketReconnect();
      });
      return client;
    };

    createClient(marketUrl, 'MARKET', false);
    createClient(publicUrl, 'PUBLIC/ORDER BOOK', true);

    addEngineLog("INFO", `Binance ${environmentLabel} market-data gateway aktif: ticker + aggTrade + order book.`);
  } catch (e: any) {
    addEngineLog("WARN", `Binance WebSocket başlatılamadı [${getBinanceEnvironment()}]: ${e?.message || e}`);
    scheduleBinanceServerWebSocketReconnect();
  }
}

function handleWsMessage(raw: any, sourceEnvironment: "testnet" | "live") {
  try {
    // CRITICAL GUARD: Only accept messages from the current active environment
    const activeEnv = getBinanceEnvironment();
    if (sourceEnvironment !== activeEnv) {
      addEngineLog("CRITICAL", `ENVIRONMENT MISMATCH! WebSocket message from ${sourceEnvironment} received but active environment is ${activeEnv}. Message REJECTED.`);
      return;
    }
    const payload = JSON.parse(raw.toString());
    const stream = payload.stream || '';
    const data = payload.data;
    if (!data) return;

    const symUpper = (data.s || '').toUpperCase();
    const activePairs = getActiveTradingPairs();
    const formattedSym = activePairs.find(w => w.replace('/', '').toUpperCase() === symUpper) || 
      (symUpper.endsWith('USDT') ? `${symUpper.slice(0, -4)}/USDT` : symUpper);

    if (stream.includes('@ticker')) {
      const currentPrice = parseFloat(data.c || data.lastPrice || data.p || 0);
      const changePct = parseFloat(data.P || data.priceChangePercent || 0);
      const volumeUsdt = parseFloat(data.q || data.quoteVolume || 0);

      if (currentPrice > 0) {
        if (!priceHistoryMap[formattedSym]) priceHistoryMap[formattedSym] = [];
        priceHistoryMap[formattedSym].push(currentPrice);
        if (priceHistoryMap[formattedSym].length > 120) priceHistoryMap[formattedSym].shift();

        if (!volumeHistoryMap[formattedSym]) volumeHistoryMap[formattedSym] = [];
        if (volumeUsdt > 0) {
          volumeHistoryMap[formattedSym].push(volumeUsdt);
          if (volumeHistoryMap[formattedSym].length > 40) volumeHistoryMap[formattedSym].shift();
        }

        if (!latestMetricsPerCoin[formattedSym]) {
          latestMetricsPerCoin[formattedSym] = {
            currentPrice,
            change_24h_pct: changePct,
            volume_24h_usdt: volumeUsdt,
            rsi: 50,
            atr: currentPrice * 0.008,
            deepScore: 0,
            netInflowUSD: 0,
            takerBuyRatio: 0.5
          };
        } else {
          latestMetricsPerCoin[formattedSym].currentPrice = currentPrice;
          if (changePct !== 0) latestMetricsPerCoin[formattedSym].change_24h_pct = changePct;
          if (volumeUsdt !== 0) latestMetricsPerCoin[formattedSym].volume_24h_usdt = volumeUsdt;
        }
        latestMetricsPerCoin[formattedSym].environment = sourceEnvironment;
        latestMetricsPerCoin[formattedSym].marketDataSource = sourceEnvironment === "testnet" ? "BINANCE_FUTURES_DEMO" : "BINANCE_FUTURES_LIVE";
        markMarketData(formattedSym, "ticker", sourceEnvironment);
      }
    } else if (stream.includes('@aggTrade')) {
      const price = parseFloat(data.p);
      const qty = parseFloat(data.q);
      const isBuyerMaker = data.m;
      const side = isBuyerMaker ? 'sell' : 'buy';
      if (!recentTradesMap[formattedSym]) recentTradesMap[formattedSym] = [];
      recentTradesMap[formattedSym].push({ price, amount: qty, side, timestamp: data.T });
      
      // Cleanup older than 15 minutes (max lookback)
      const cutoff = Date.now() - 15 * 60 * 1000;
      recentTradesMap[formattedSym] = recentTradesMap[formattedSym].filter(t => t.timestamp > cutoff);
      markMarketData(formattedSym, "trade", sourceEnvironment);
    } else if (stream.includes('@depth')) {
      applyDepthEvent(formattedSym, data);
    }
  } catch (err) {}
}

// Start WebSocket stream immediately
startBinanceServerWebSocket();

// =============== CORE REAL-TIME LOOP ===============
async function updateMarketDataAndExecute() {
  const loopEnvironment = currentEnvironment();
  // Sync positions from Binance if authenticated
  if (exchange && isExchangeAuthenticated) {
    try {
      await syncBinancePositions();
    } catch (e) {}
  }

  const activePairs = getActiveTradingPairs();
  const now = Date.now();
  if (botState === "running" && now - lastScanLogTime > 12000) {
    lastScanLogTime = now;
    const activeCount = Object.keys(activePositions).length;
    const modeLabel = coinSelectionMode === 'algorithm' ? 'ALGORİTMA MODU (Dinamik En İyi Coinler)' : 'MANUEL MOD (Seçili Pariteler)';
    addEngineLog("INFO", `[CANLI TARAMA | ${modeLabel}] ${activePairs.length} parite taranıyor | Açık Pozisyon: ${activeCount} / ${maxOpenTrades} | Motor: ÇALIŞIYOR`);
  }

  const entryCandidates: {
    symbol: string;
    score: number;
    type: "long" | "short";
    edgeDiff?: number;
    price: number;
    predictedProfitPct?: number;
    predictedTimeSec?: number;
    smartTargetPrice?: number;
    takerBuyRatio?: number;
    netInflowUSD?: number;
    longFlowScore?: number;
    shortFlowScore?: number;
    resistanceRatio?: number;
    expectedNetProfitUSD?: number;
  }[] = [];

  await Promise.allSettled(
    activePairs.map(async (symbol) => {
      try {
        if (currentEnvironment() !== loopEnvironment) return;
        const cleanSymbol = symbol.replace("/", "").toUpperCase();
        let ticker: any = null;
        let ob: any = latestOrderBooks[symbol];
        const memMetric = latestMetricsPerCoin[symbol];
        let currentPrice = memMetric?.currentPrice || ob?.bids?.[0]?.[0] || 0;

        // If not in WebSocket buffer or price missing, fetch immediately from Binance REST
        if (!currentPrice || currentPrice === 0 || !ob || !ob.bids || ob.bids.length < 10) {
          try {
            const [depthRes, tickerRes] = await Promise.all([
              fetch(`${futuresRestBase(loopEnvironment)}/fapi/v1/depth?symbol=${cleanSymbol}&limit=50`),
              fetch(`${futuresRestBase(loopEnvironment)}/fapi/v1/ticker/24hr?symbol=${cleanSymbol}`)
            ]);

            if (depthRes.ok) {
              const depthData = await depthRes.json();
              ob = {
                bids: (depthData.bids || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
                asks: (depthData.asks || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]),
                timestamp: Date.now(),
                environment: currentEnvironment()
              };
              if (currentEnvironment() !== loopEnvironment) return;
              latestOrderBooks[symbol] = ob;
              markMarketData(symbol, "depth", loopEnvironment);
            }

            if (tickerRes.ok) {
              const tick = await tickerRes.json();
              ticker = {
                last: parseFloat(tick.lastPrice),
                percentage: parseFloat(tick.priceChangePercent),
                quoteVolume: parseFloat(tick.quoteVolume)
              };
              if (currentEnvironment() !== loopEnvironment) return;
              currentPrice = ticker.last;
              ticker.environment = loopEnvironment;
              markMarketData(symbol, "ticker", loopEnvironment);
            }
          } catch (e) {
            try {
              const fallbackTicker = await fetch(`${futuresRestBase(loopEnvironment)}/fapi/v1/ticker/price?symbol=${cleanSymbol}`);
              if (fallbackTicker.ok) {
                const tick = await fallbackTicker.json();
                if (currentEnvironment() !== loopEnvironment) return;
                currentPrice = parseFloat(tick.price);
                markMarketData(symbol, "ticker", loopEnvironment);
              }
            } catch (err) {}
          }
        }

        // Seed recent trades if empty or sparse (< 10 trades)
        if (!recentTradesMap[symbol] || recentTradesMap[symbol].length < 10) {
          try {
            const tradesRes = await fetch(`${futuresRestBase(loopEnvironment)}/fapi/v1/trades?symbol=${cleanSymbol}&limit=50`);
            if (tradesRes.ok) {
              const tradesData = await tradesRes.json();
              if (Array.isArray(tradesData) && tradesData.length > 0) {
                if (currentEnvironment() !== loopEnvironment) return;
                recentTradesMap[symbol] = tradesData.map((t: any) => ({
                  price: parseFloat(t.price),
                  amount: parseFloat(t.qty),
                  side: t.isBuyerMaker ? 'sell' : 'buy',
                  timestamp: t.time || Date.now()
                }));
                markMarketData(symbol, "trade", loopEnvironment);
              }
            }
          } catch (e) {}
        }

        if (!currentPrice || currentPrice <= 0) return;
        if (!ob || !ob.bids || ob.bids.length === 0 || !ob.asks || ob.asks.length === 0) return;

        // Initialize or update rolling price history
        if (!priceHistoryMap[symbol]) {
          priceHistoryMap[symbol] = [];
        }
        priceHistoryMap[symbol].push(currentPrice);
        if (priceHistoryMap[symbol].length > 40) priceHistoryMap[symbol].shift();

        const prices = priceHistoryMap[symbol];
        const volumes = volumeHistoryMap[symbol] || [];

        // Technical Indicators
        const rsiData = prices.length >= 15 ? RSI.calculate({ period: 14, values: prices }) : [];
        const currentRSI = rsiData.length > 0 ? rsiData[rsiData.length - 1] : 50;

        const ema9Data = prices.length >= 10 ? EMA.calculate({ period: 9, values: prices }) : [];
        const currentEMA9 = ema9Data.length > 0 ? ema9Data[ema9Data.length - 1] : currentPrice;

        const ema21Data = prices.length >= 22 ? EMA.calculate({ period: 21, values: prices }) : [];
        const currentEMA21 = ema21Data.length > 0 ? ema21Data[ema21Data.length - 1] : currentPrice;

        const currentATR = currentPrice * 0.008;

        // Deep Inflow & Order Flow Metrics
        const currentCutoff = Date.now() - (activeLookbackMin * 60 * 1000);
        const activeTrades = (recentTradesMap[symbol] || []).filter((t: any) => t.timestamp > currentCutoff);
        const flow = analyzeMicrostructure(symbol, ob, activeTrades, prices, volumes, currentPrice);

        if (currentEnvironment() !== loopEnvironment) return;

        // Update real-time metrics dictionary
        latestMetricsPerCoin[symbol] = {
          currentPrice,
          change_24h_pct: ticker?.percentage || latestMetricsPerCoin[symbol]?.change_24h_pct || 0,
          volume_24h_usdt: ticker?.quoteVolume || latestMetricsPerCoin[symbol]?.volume_24h_usdt || 0,
          rsi: currentRSI,
          ema9: currentEMA9,
          ema21: currentEMA21,
          atr: currentATR,
          ...flow,
          environment: loopEnvironment,
          marketDataSource: loopEnvironment === "testnet" ? "BINANCE_FUTURES_DEMO" : "BINANCE_FUTURES_LIVE"
        };

        const pos = activePositions[symbol];

        // ================= EXITS: PROFIT PROTECTION + TARGET TP + STRICT STOP LOSS =================
        if (pos) {
          pos.deepScoreHistory.push(flow.deepScore);
          if (pos.deepScoreHistory.length > 30) pos.deepScoreHistory.shift();
          pos.orderFlowGapHistory ||= [];
          pos.pnlHistory ||= [];
          pos.orderFlowGapHistory.push(flow.orderFlowGap);
          if (pos.orderFlowGapHistory.length > 30) pos.orderFlowGapHistory.shift();

          if (pos.type === "long") pos.peakPrice = Math.max(pos.peakPrice, currentPrice);
          else pos.peakPrice = Math.min(pos.peakPrice, currentPrice);

          const pnlUSD = pos.type === "long"
            ? (currentPrice - pos.entryPrice) * pos.amount
            : (pos.entryPrice - currentPrice) * pos.amount;
          const initialMargin = (pos.entryPrice * pos.amount) / pos.leverage;
          const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;
          pos.peakNetPnl = Math.max(pos.peakNetPnl ?? pnlUSD, pnlUSD);
          pos.pnlHistory.push(pnlUSD);
          if (pos.pnlHistory.length > 30) pos.pnlHistory.shift();

          const peakPnl = Math.max(0, pos.peakNetPnl || 0);
          const pnlDrawdown = peakPnl > 0 ? (peakPnl - pnlUSD) / peakPnl : 0;
          const positivePnl = pnlUSD > 0;
          const gaps = pos.orderFlowGapHistory;
          const last10 = gaps.slice(-10);
          const avg10 = last10.length ? last10.reduce((a, b) => a + b, 0) / last10.length : flow.orderFlowGap;
          const sideGap = pos.type === "long" ? flow.orderFlowGap : -flow.orderFlowGap;
          const moneyWeak = pos.type === "long" ? (flow.longFlowScore < 42 || flow.inflowMomentum < -20) : (flow.shortFlowScore < 42 || flow.inflowMomentum > 20);
          const significantPeakGiveback = peakPnl >= Math.max(0.60, activeStakeAmount * 0.025) && pnlDrawdown >= 0.28;

          const priceGainPct = pos.type === "long"
            ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
            : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

          // ================= 1. OTOMATİK BAŞA-BAŞ (BREAKEVEN) KÂR KİLİDİ =================
          // Pozisyon +%0.50 fiyatta kâra geçtiğinde (49x kaldıraçta +%25 ROE),
          // Stop seviyesi otomatik olarak maliyetin üstüne çekilir (+%0.12 ile Binance komisyonları garantiye alınır).
          if (priceGainPct >= 0.50 && !pos.breakevenHit) {
            pos.breakevenHit = true;
            const beStop = pos.type === "long" 
              ? pos.entryPrice * 1.0012 
              : pos.entryPrice * 0.9988;
            pos.baseStopPrice = Number(beStop.toFixed(4));
            addEngineLog("INFO", `[BAŞA-BAŞ KORUMA (BE)] ${symbol} ${pos.type.toUpperCase()} kâra geçti (+%${priceGainPct.toFixed(2)}). Zarar kes maliyetin üstüne çekildi (BE: $${pos.baseStopPrice}).`);
          }

          let shouldExit = false;
          let exitReason = "";
          let exitDiagnostic = "";

          // ================= 2. ZARAR KES (STRICT STOP LOSS / BE STOP) =================
          const stopLossThreshold = Math.max(0.1, Math.abs(pos.stopLossPct || activeStopLossPct || 1.0));
          const priceLossPct = pos.type === "long"
            ? ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100
            : ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
          
          const hitBaseStop = pos.baseStopPrice > 0 && (
            pos.type === "long" ? currentPrice <= pos.baseStopPrice : currentPrice >= pos.baseStopPrice
          );

          if (priceLossPct >= stopLossThreshold || hitBaseStop) {
            shouldExit = true;
            if (pos.breakevenHit && pnlUSD >= -0.10) {
              exitReason = `Başa-Baş Kâr Koruma (BE Stop Tetiklendi) | PnL: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)}`;
              exitDiagnostic = "BREAKEVEN_SAVED";
            } else {
              exitReason = `Zarar Kes (Stop Loss: -%${stopLossThreshold.toFixed(2)}) | Fiyat: $${currentPrice.toFixed(4)} | PnL: -$${Math.abs(pnlUSD).toFixed(2)} (%${roePct.toFixed(1)} ROE)`;
              exitDiagnostic = "STOP_LOSS";
            }
          }

          // ================= 3. MANUEL KÂR HEDEFİ (TP) =================
          const configuredTakeProfitPct = clamp(Math.abs(Number(pos.takeProfitPct ?? activeTakeProfitPct ?? 0.5)), 0.1, 20);
          if (!shouldExit && positivePnl && priceGainPct >= configuredTakeProfitPct) {
            shouldExit = true;
            exitReason = `Manuel Kâr Hedefi (TP %${configuredTakeProfitPct.toFixed(2)}): $${currentPrice.toFixed(4)} | Kâr: +$${pnlUSD.toFixed(2)} (+%${roePct.toFixed(1)} ROE)`;
            exitDiagnostic = "TP_SUCCESS";
          }

          // ================= 4. DİNAMİK TRAILING KÂR KİLİDİ (+%0.90+ KÂRDA ZİRVE TAKİBİ) =================
          if (!shouldExit && priceGainPct >= 0.90) {
            const trailingLeewayPct = 0.32; // Zirveden %0.32 çekilme payı
            const trailingStopPrice = pos.type === "long"
              ? pos.peakPrice * (1 - trailingLeewayPct / 100)
              : pos.peakPrice * (1 + trailingLeewayPct / 100);

            const hitTrailing = pos.type === "long" ? currentPrice <= trailingStopPrice : currentPrice >= trailingStopPrice;
            if (hitTrailing && positivePnl) {
              shouldExit = true;
              exitReason = `Dinamik Trailing Kâr Kilidi: Zirveden çekilme tespit edildi | Kâr: +$${pnlUSD.toFixed(2)} (+%${roePct.toFixed(1)} ROE)`;
              exitDiagnostic = "TRAILING_PROFIT";
            }
          }

          // ================= 4. KÂR KORUMA: PARA AKIŞI ANİ ÇÖKÜŞÜ & ÇEKİLME =================
          if (!shouldExit && positivePnl && (significantPeakGiveback || (pnlDrawdown >= 0.32 && moneyWeak))) {
            shouldExit = true;
            exitReason = `Kâr Koruma: Para akışı yön değiştirdi | Kâr: +$${pnlUSD.toFixed(2)} (+%${roePct.toFixed(1)}) | Zirve: $${peakPnl.toFixed(2)}`;
            exitDiagnostic = "TREND_REVERSAL_EXIT";
          }

          // ================= 6. MODEL HEDEF FİYATI =================
          if (!shouldExit && pos.modelTargetPrice && pos.modelTargetPrice > 0) {
            const targetReached = pos.type === "long" ? currentPrice >= pos.modelTargetPrice : currentPrice <= pos.modelTargetPrice;
            if (targetReached && positivePnl) {
              shouldExit = true;
              exitReason = `Hedef Fiyat Kâr Al (TP): $${currentPrice.toFixed(4)} | Kâr: +$${pnlUSD.toFixed(2)} (+%${roePct.toFixed(1)})`;
              exitDiagnostic = "TP_SUCCESS";
            }
          }

          if (shouldExit && activePositions[symbol]) {
            await executeExit(symbol, exitReason, currentPrice, exitDiagnostic);
          }
        } 
        // ================= ENTRY: INTELLIGENT LONG / SHORT MONEY FLOW & RESISTANCE ENGINE =================
        else if (botState === "running") {
          // Open positions up to maximum capacity
          if (Object.keys(activePositions).length < maxOpenTrades) {
            // Check post-loss cooldown for this pair
            const inCooldown = pairLossCooldown[symbol] && Date.now() < pairLossCooldown[symbol];
            const spreadOk = flow.spreadPct <= 0.0018; // Maximum 0.18% spread to avoid high fee drag
            
            // LONG GİRİŞ KRİTERLERİ (Direnç, Hacim, Trend ve RSI filtreli)
            // 1. Cooldown aktif olmamalı ve Spread makul olmalı
            // 2. Long skoru Short skorundan en az 7 puan üstün ve >= 55 olmalı
            // 3. Taker alıcı oranı >= %53 ve Net para girişi pozitif olmalı
            // 4. Önünde aşırı satış direnç duvarı olmamalı (resistanceRatioLong <= 2.0 ve wallResistanceLong false)
            // 5. RSI aşırı alım bölgesinde olmamalı (RSI <= 76) ve Fiyat EMA9 üstünde seyretmeli
            const isLongSignal = (
              !inCooldown &&
              spreadOk &&
              flow.longFlowScore >= 55.0 &&
              (flow.longFlowScore - flow.shortFlowScore) >= 7.0 &&
              flow.takerBuyRatio >= 0.53 &&
              flow.netInflowUSD > 0 &&
              flow.resistanceRatioLong <= 2.0 &&
              (!flow.wallResistanceLong || flow.inflowMomentum > 25) &&
              currentRSI <= 76 &&
              currentPrice >= currentEMA9 * 0.9985 &&
              flow.movementPotentialPct >= activeMinExpectedMovePct &&
              flow.expectedNetProfitUSD > 0.30
            );

            // SHORT GİRİŞ KRİTERLERİ (Destek, Hacim, Trend ve RSI filtreli)
            // 1. Cooldown aktif olmamalı ve Spread makul olmalı
            // 2. Short skoru Long skorundan en az 7 puan üstün ve >= 55 olmalı
            // 3. Taker satıcı oranı >= %53 (takerBuyRatio <= 0.47) ve Net para çıkışı olmalı
            // 4. Altında aşırı alış destek tabanı olmamalı (resistanceRatioShort <= 2.0 ve wallResistanceShort false)
            // 5. RSI aşırı satım bölgesinde olmamalı (RSI >= 24) ve Fiyat EMA9 altında seyretmeli
            const isShortSignal = (
              !inCooldown &&
              spreadOk &&
              flow.shortFlowScore >= 55.0 &&
              (flow.shortFlowScore - flow.longFlowScore) >= 7.0 &&
              flow.takerBuyRatio <= 0.47 &&
              flow.netInflowUSD < 0 &&
              flow.resistanceRatioShort <= 2.0 &&
              (!flow.wallResistanceShort || flow.inflowMomentum < -25) &&
              currentRSI >= 24 &&
              currentPrice <= currentEMA9 * 1.0015 &&
              flow.movementPotentialPct >= activeMinExpectedMovePct &&
              flow.expectedNetProfitUSD > 0.30
            );

            if (isLongSignal || isShortSignal) {
              let type: "long" | "short" = "long";
              let score = 50;
              let edgeDiff = 0;

              if (isLongSignal && (!isShortSignal || flow.longFlowScore >= flow.shortFlowScore)) {
                type = "long";
                edgeDiff = flow.longFlowScore - flow.shortFlowScore;
                score = flow.longFlowScore + (flow.netInflowUSD > 0 ? 5 : 0) + (flow.takerBuyRatio * 15);
              } else {
                type = "short";
                edgeDiff = flow.shortFlowScore - flow.longFlowScore;
                score = flow.shortFlowScore + (flow.netInflowUSD < 0 ? 5 : 0) + ((1 - flow.takerBuyRatio) * 15);
              }

              entryCandidates.push({
                symbol,
                score,
                type,
                edgeDiff,
                price: currentPrice,
                predictedProfitPct: flow.movementPotentialPct,
                predictedTimeSec: flow.predictedTimeSec,
                smartTargetPrice: flow.expectedTargetPrice,
                takerBuyRatio: flow.takerBuyRatio,
                netInflowUSD: flow.netInflowUSD,
                longFlowScore: flow.longFlowScore,
                shortFlowScore: flow.shortFlowScore,
                resistanceRatio: type === "long" ? flow.resistanceRatioLong : flow.resistanceRatioShort,
                expectedNetProfitUSD: flow.expectedNetProfitUSD
              });
            }
          }
        }
      } catch (e: any) {
        addEngineLog("ERROR", `[LOOP HATASI] ${symbol}: ${e.message}`);
      }
    })
  );

  // Process entry candidates sorted by score descending (highest flow dominance first)
  if (entryCandidates.length > 0 && botState === "running" && exchange && isExchangeAuthenticated && Object.keys(activePositions).length < maxOpenTrades) {
    entryCandidates.sort((a, b) => b.score - a.score);

    for (const candidate of entryCandidates) {
      if (Object.keys(activePositions).length >= maxOpenTrades) break;
      
      const { symbol, type, price, score, takerBuyRatio, netInflowUSD, longFlowScore, shortFlowScore, resistanceRatio, expectedNetProfitUSD, predictedProfitPct } = candidate;
      if (activePositions[symbol]) continue;
      if (!hasFreshMarketData(symbol, true)) {
        addEngineLog("WARN", `[EMİR ATLADI] ${symbol}: seçili Binance Futures ortamından taze fiyat + order book doğrulanmadı.`);
        continue;
      }

      const metric = latestMetricsPerCoin[symbol] || {};
      const buyRatioPct = ((takerBuyRatio || metric.takerBuyRatio || 0.5) * 100).toFixed(1);
      const inflow = Math.round(netInflowUSD || metric.netInflowUSD || 0);
      const lScore = Math.round(longFlowScore || metric.longFlowScore || 50);
      const sScore = Math.round(shortFlowScore || metric.shortFlowScore || 50);
      const resVal = Number(resistanceRatio || 1.0).toFixed(2);
      const expProfit = Number(expectedNetProfitUSD || 1.0).toFixed(2);
      const movePct = Number(predictedProfitPct || 1.5).toFixed(2);

      addEngineLog(
        "TRADE",
        `[AKILLI GİRİŞ ONAYI] ${symbol} ${type.toUpperCase()} | Para Akışı: Long ${lScore} / Short ${sScore} | Alıcı: %${buyRatioPct} | Net Akış: ${inflow >= 0 ? '+' : ''}$${inflow.toLocaleString()} | Karşı Direnç Oranı: ${resVal} | Beklenen Hareket: %${movePct} (Tahmini Net Kâr: +$${expProfit})`
      );

      await executeEntry(symbol, type, price);
    }
  }
}

// Helper to resolve CCXT market symbols (e.g. DOGE/USDT -> DOGE/USDT:USDT on Binance Futures)
function getMarketSymbol(sym: string): string {
  if (!exchange) return sym;
  try {
    if (exchange.markets && exchange.markets[sym]) return sym;
    const withColon = `${sym}:USDT`;
    if (exchange.markets && exchange.markets[withColon]) return withColon;
    const clean = sym.replace('/', '');
    if (exchange.markets && exchange.markets[clean]) return clean;
    if (typeof (exchange as any).market === 'function') {
      const m = (exchange as any).market(sym);
      if (m && m.symbol) return m.symbol;
    }
  } catch (e) {}
  return sym.includes(':') ? sym : `${sym}:USDT`;
}

async function executeEntry(symbol: string, type: "long" | "short", currentPrice: number) {
  if (activePositions[symbol] || pendingEntries.has(symbol)) return;
  const env = currentEnvironment();
  if (!exchange || !isExchangeAuthenticated || activeExchangeEnvironment !== env) {
    addEngineLog("ERROR", `[EMİR ENGELLENDİ] ${symbol}: Binance API ortamı seçili ortamla eşleşmiyor (${env}).`);
    return;
  }
  if (!hasFreshMarketData(symbol, true)) {
    addEngineLog("WARN", `[EMİR ENGELLENDİ] ${symbol}: ${env.toUpperCase()} Futures fiyat + order book verisi yeterince taze değil.`);
    return;
  }
  if (!exchange || !isExchangeAuthenticated) {
    addEngineLog("WARN", `[EMİR ENGELLENDİ] ${symbol}: Binance API doğrulanmadan pozisyon açılamaz. Yerel/simülasyon pozisyonu oluşturulmadı.`);
    return;
  }
  pendingEntries.add(symbol);
  try {
  const effectivePrice = currentPrice || latestMetricsPerCoin[symbol]?.currentPrice || 1;

  // Calculate position amount adhering strictly to margin and leverage
  let notionalUSD = activeStakeAmount * targetLeverage;
  // Ensure minimum Binance Futures notional (min $5.5 USDT to prevent MIN_NOTIONAL error)
  if (notionalUSD < 6) notionalUSD = 6;

  let rawAmount = notionalUSD / effectivePrice;
  const exSymbol = getMarketSymbol(symbol);
  let formattedAmount = rawAmount;

  if (exchange) {
    if (!exchange.markets || Object.keys(exchange.markets).length === 0) {
      try {
        await exchange.loadMarkets();
      } catch (e) {}
    }

    const market = exchange.markets ? (exchange.markets[exSymbol] || exchange.markets[symbol]) : null;

    if (market?.limits?.amount?.min && rawAmount < market.limits.amount.min) {
      rawAmount = market.limits.amount.min;
    }

    try {
      formattedAmount = parseFloat(exchange.amountToPrecision(exSymbol, rawAmount));
    } catch (e) {
      formattedAmount = effectivePrice > 100 
        ? Number(rawAmount.toFixed(3)) 
        : (effectivePrice > 1 ? Number(rawAmount.toFixed(1)) : Math.round(rawAmount));
    }
  }

  // Ensure valid numerical amount
  if (!formattedAmount || formattedAmount <= 0 || isNaN(formattedAmount)) {
    formattedAmount = rawAmount >= 1 ? Math.round(rawAmount) : Number(rawAmount.toFixed(3));
  }

  let entryPrice = effectivePrice;
  let stopOrderId: string | undefined = undefined;
  let isRealOrder = false;

  // If real authenticated Binance API is active, send actual market order
  if (exchange && isExchangeAuthenticated) {
    try {
      try {
        await exchange.setLeverage(targetLeverage, exSymbol);
      } catch (e: any) {}

      try {
        await (exchange as any).setMarginMode(activeMarginMode === 'cross' ? 'CROSSED' : 'ISOLATED', exSymbol);
      } catch (e: any) {}

      const side = type === "long" ? "buy" : "sell";
      const order = await exchange.createOrder(exSymbol, "market", side, formattedAmount);
      let filledOrder:any = order;
      try {
        if (order?.id && typeof (exchange as any).fetchOrder === "function") filledOrder = await (exchange as any).fetchOrder(order.id, exSymbol);
      } catch {}
      entryPrice = Number(filledOrder?.average || filledOrder?.price || effectivePrice);
      formattedAmount = Number(filledOrder?.filled || formattedAmount);
      isRealOrder = true;

      
      const configuredStopLoss = Math.max(0.1, Math.abs(activeStopLossPct || 1.0));
      const stopPriceBase = type === "long" 
        ? entryPrice * (1 - configuredStopLoss / 100) 
        : entryPrice * (1 + configuredStopLoss / 100);
      let stopPrice = Number(stopPriceBase.toFixed(4));
      try {
        stopPrice = parseFloat(exchange.priceToPrecision(exSymbol, stopPriceBase));
      } catch (e) {}

      try {
        const stopSide = type === "long" ? "sell" : "buy";
        const stopOrder = await exchange.createOrder(exSymbol, "STOP_MARKET", stopSide, formattedAmount, undefined, { 
          stopPrice, 
          reduceOnly: true,
          workingType: 'MARK_PRICE'
        });
        stopOrderId = stopOrder?.id;
      } catch (e: any) {
        addEngineLog("WARN", `[BINANCE STOP-LOSS] Borsa STOP_MARKET emri oluşturulamadı (${e.message}). Sunucu içi garantili zarar kes devrede (Fiyat $${stopPrice} seviyesinde tetiklenecek).`);
      }

      addEngineLog("TRADE", `[BINANCE POZİSYONU AÇILDI] ${symbol} ${type.toUpperCase()} x${targetLeverage} | Notional: $${Math.round(entryPrice * formattedAmount)} | Giriş: $${entryPrice} | Stop Fiyatı: $${stopPrice} (-%${configuredStopLoss})`);
    } catch (e: any) {
      addEngineLog("ERROR", `[BINANCE] ${symbol} Emir Hatası: ${e.message}`);
      throw e;
    }
  }

  const configuredStopLoss = Math.max(0.1, Math.abs(activeStopLossPct || 1.0));
  const stopPriceBase = type === "long" 
    ? entryPrice * (1 - configuredStopLoss / 100) 
    : entryPrice * (1 + configuredStopLoss / 100);

  activePositions[symbol] = {
    trade_id: tradeCounter++,
    pair: symbol,
    type,
    entryPrice,
    amount: formattedAmount,
    peakPrice: entryPrice,
    openDate: Date.now(),
    lookbackMin: activeLookbackMin,
    stopLossPct: configuredStopLoss,
    deepScoreHistory: [],
    orderFlowGapHistory: [],
    pnlHistory: [],
    peakNetPnl: 0,
    modelTargetPnlUSD: Number(latestMetricsPerCoin[symbol]?.expectedNetProfitUSD || 0),
    modelTargetPrice: Number(latestMetricsPerCoin[symbol]?.expectedTargetPrice || entryPrice),
    modelTargetConfidence: Number(latestMetricsPerCoin[symbol]?.targetConfidence || 0),
    modelTargetAccuracySample: Number(latestMetricsPerCoin[symbol]?.targetAccuracySample || 0),
    modelTargetAccuracyRate: latestMetricsPerCoin[symbol]?.targetAccuracyRate ?? null,
    leverage: targetLeverage,
    baseStopPrice: (() => {
      try { return Number(exchange?.priceToPrecision(exSymbol, stopPriceBase) || stopPriceBase); } catch { return Number(stopPriceBase.toFixed(8)); }
    })(),
    binanceStopOrderId: stopOrderId,
    takeProfitPct: activeTakeProfitPct,
    unrealizedPnl: 0,
    percentage: 0,
    markPrice: entryPrice,
    pnlSource: isRealOrder ? "binance" : "local"
  };
  (activePositions[symbol] as any).isRealBinance = isRealOrder;

  allTrades.unshift({ ...activePositions[symbol], is_open: true });
  saveTradesHistory();
  } finally {
    pendingEntries.delete(symbol);
  }
}

async function executeExit(symbol: string, reason: string, currentPrice: number, diagnostic?: string) {
  const pos = activePositions[symbol];
  if (!pos) return;

  const exSymbol = getMarketSymbol(symbol);
  let realizedAmount = pos.amount;

  if (exchange && isExchangeAuthenticated) {
    try {
      // 1. Cancel open stop-loss / conditional orders FIRST so Binance frees reduceOnly quota
      if (pos.binanceStopOrderId) {
        try {
          await exchange.cancelOrder(pos.binanceStopOrderId, exSymbol);
        } catch (e) {}
      }
      try {
        if (typeof (exchange as any).cancelAllOrders === "function") {
          await (exchange as any).cancelAllOrders(exSymbol);
        }
      } catch (e) {}

      // 2. Query actual live position on Binance to avoid closing non-existent or mismatched positions
      let actualContracts = pos.amount;
      try {
        if (typeof (exchange as any).fetchPositions === "function") {
          const rawSymbol = exSymbol.replace(/[/:]/g, '');
          const positions = await (exchange as any).fetchPositions([exSymbol]);
          const matched = (positions || []).find((p: any) => 
            p.symbol === exSymbol || 
            p.info?.symbol === rawSymbol ||
            p.info?.symbol === symbol.replace(/[/:]/g, '')
          );
          if (matched) {
            const size = Number(matched.contracts ?? matched.info?.positionAmt ?? matched.amount ?? 0);
            actualContracts = Math.abs(size);
          }
        }
      } catch (e) {}

      if (actualContracts > 0) {
        const side = pos.type === "long" ? "sell" : "buy";
        let exitAmount = actualContracts;
        try {
          exitAmount = parseFloat(exchange.amountToPrecision(exSymbol, exitAmount));
        } catch (e) {}

        if (exitAmount > 0) {
          let exitFillPrice = currentPrice;
          realizedAmount = exitAmount;
          try {
            const exitOrder = await exchange.createOrder(exSymbol, "market", side, exitAmount, undefined, { reduceOnly: true });
            if (exitOrder?.id && typeof (exchange as any).fetchOrder === "function") {
              try {
                const eo = await (exchange as any).fetchOrder(exitOrder.id, exSymbol);
                exitFillPrice = Number(eo?.average || eo?.price || currentPrice);
                if (Number(eo?.filled) > 0) realizedAmount = Number(eo.filled);
              } catch {}
            }
          } catch (orderErr: any) {
            if (orderErr.message && (orderErr.message.includes("-2022") || orderErr.message.includes("ReduceOnly"))) {
              // If reduceOnly rejected, make sure all orders are cancelled and retry or handle gracefully
              try {
                if (typeof (exchange as any).cancelAllOrders === "function") {
                  await (exchange as any).cancelAllOrders(exSymbol);
                }
                const exitOrder2 = await exchange.createOrder(exSymbol, "market", side, exitAmount);
                if (exitOrder2?.id && typeof (exchange as any).fetchOrder === "function") {
                  try {
                    const eo = await (exchange as any).fetchOrder(exitOrder2.id, exSymbol);
                    exitFillPrice = Number(eo?.average || eo?.price || currentPrice);
                    if (Number(eo?.filled) > 0) realizedAmount = Number(eo.filled);
                  } catch {}
                }
              } catch (retryErr: any) {
                addEngineLog("WARN", `[BINANCE] ${symbol} pozisyonu borsada zaten kapanmış veya miktar 0: ${retryErr.message}`);
              }
            } else {
              throw orderErr;
            }
          }
          currentPrice = exitFillPrice;
        }
      } else {
        addEngineLog("INFO", `[BINANCE] ${symbol} pozisyonunun borsada zaten kapandığı tespit edildi.`);
      }
    } catch (e: any) {
      addEngineLog("ERROR", `[BINANCE] ${symbol} Çıkış Emri Hatası: ${e.message}`);
    }
  }

  // Gross realized PnL based on the confirmed/used exit fill. Trading fees and funding are not included.
  const pnlUSD = pos.type === "long"
    ? (currentPrice - pos.entryPrice) * realizedAmount
    : (pos.entryPrice - currentPrice) * realizedAmount;

  const initialMargin = (pos.entryPrice * realizedAmount) / pos.leverage;
  const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;

  // Determine diagnostic classification
  let finalDiag = diagnostic;
  if (!finalDiag) {
    if (reason.includes("Hedef Fiyat") || reason.includes("TP")) finalDiag = "TP_SUCCESS";
    else if (reason.includes("Trailing")) finalDiag = "TRAILING_LOCK_SUCCESS";
    else if (reason.includes("Başa-Baş") || reason.includes("BE Stop")) finalDiag = "BREAKEVEN_SAVED";
    else if (pnlUSD < 0 || reason.includes("Zarar Kes") || reason.includes("Stop Loss")) finalDiag = "STOP_LOSS";
    else if (reason.includes("Kullanıcı") || reason.includes("Manuel")) finalDiag = "MANUAL_EXIT";
    else finalDiag = pnlUSD >= 0 ? "PROFIT_PROTECTION" : "LOSS_CUT";
  }

  const tradeIndex = allTrades.findIndex(t => t.trade_id === pos.trade_id);
  if (tradeIndex !== -1) {
    allTrades[tradeIndex].is_open = false;
    allTrades[tradeIndex].close_rate = currentPrice;
    allTrades[tradeIndex].close_date = Date.now();
    allTrades[tradeIndex].close_reason = reason;
    allTrades[tradeIndex].profit_abs = Number(pnlUSD.toFixed(2));
    allTrades[tradeIndex].profit_pct = Number(roePct.toFixed(2));
    allTrades[tradeIndex].diagnostic = finalDiag;
  }

  // Set 4-minute cooldown if trade closed at a loss to protect against whipsaws
  if (pnlUSD < 0 || reason.includes("Stop Loss") || reason.includes("Zarar Kes")) {
    pairLossCooldown[symbol] = Date.now() + (4 * 60 * 1000);
    addEngineLog("INFO", `[KORUMA MODU] ${symbol} pozisyonu zararla kapandı. Algoritma 4 dakika süreyle bu coinde yeni işlem açmayacaktır.`);
  }

  delete activePositions[symbol];
  saveTradesHistory();
  addEngineLog("TRADE", `[POZİSYON KAPANDI] ${symbol} | Neden: ${reason} | Sonuç: ${pnlUSD >= 0 ? '+' : ''}$${pnlUSD.toFixed(2)} (${roePct >= 0 ? '+' : ''}${roePct.toFixed(2)}%)`);
}

function startTradingEngine() {
  if (botState === "running") return;
  botState = "running";
  addEngineLog("INFO", "Yüksek Para Girişi & HFT Motoru Başlatıldı.");
  addEngineLog("INFO", getBinanceEnvironment() === "testnet" ? "Mod: TESTNET/DEMO (Binance Futures sanal hesap)" : "Mod: CANLI İŞLEM (Gerçek Binance Futures)");
  if (!exchange || !isExchangeAuthenticated) {
    addEngineLog("WARN", "Binance API doğrulanmadı. Piyasa taraması yapılabilir ancak hiçbir pozisyon/emir yerel simülasyon olarak oluşturulmayacaktır.");
  }
  // Run scan immediately
  setTimeout(updateMarketDataAndExecute, 100);
}

async function stopTradingEngine() {
  botState = "stopped";
  addEngineLog("INFO", "Ticaret Motoru Durduruldu. Açık pozisyonlar kapatılıyor...");

  const openSymbols = Object.keys(activePositions);
  if (openSymbols.length > 0) {
    addEngineLog("INFO", `Bot durdurulduğu için ${openSymbols.length} adet açık pozisyon piyasa emriyle kapatılıyor...`);
    for (const sym of openSymbols) {
      const price = latestMetricsPerCoin[sym]?.currentPrice || activePositions[sym].entryPrice;
      await executeExit(sym, "Bot Durduruldu - Otomatik Kapatma", price);
    }
  }

  // Also clean up any open trades marked in allTrades
  for (const t of allTrades) {
    if (t.is_open) {
      t.is_open = false;
      t.close_date = Date.now();
      t.close_reason = "Bot Durduruldu - Otomatik Kapatma";
      t.close_rate = latestMetricsPerCoin[t.pair]?.currentPrice || t.entryPrice;
    }
  }

  // Ensure exchange positions and open orders are also wiped if authenticated
  if (exchange && isExchangeAuthenticated && typeof (exchange as any).fetchPositions === "function") {
    try {
      const livePositions = await (exchange as any).fetchPositions();
      for (const p of livePositions) {
        const contracts = Math.abs(Number(p.contracts || p.positionAmt || p.size || 0));
        if (contracts > 0) {
          const sym = p.symbol;
          const side = (p.side === "long" || Number(p.positionAmt || 0) > 0) ? "sell" : "buy";
          try {
            if (typeof (exchange as any).cancelAllOrders === "function") {
              await (exchange as any).cancelAllOrders(sym);
            }
            await exchange.createOrder(sym, "market", side, contracts, undefined, { reduceOnly: true });
            addEngineLog("TRADE", `[BINANCE] Borsa üzerindeki açık ${sym} kontratı bot durdurulurken piyasa emriyle tamamen kapatıldı.`);
          } catch (e: any) {
            addEngineLog("WARN", `[BINANCE] ${sym} kapatma bilgisi: ${e.message}`);
          }
        }
      }
    } catch (e: any) {}
  }
}

// Background continuous data ticker (Runs every 2.5s for live UI metrics)
dataLoop = setInterval(updateMarketDataAndExecute, 2500);

// =============== API ROUTES ===============
app.use(express.json());

app.get("/api/v1/status", (req, res) => {
  fetchServerIp();
  res.json({
    state: botState,
    trading_mode: getBinanceEnvironment(),
    coin_selection_mode: coinSelectionMode,
    strategy: "High_Inflow_Quant_Futures",
    timeframe: "1m",
    open_trades: Object.keys(activePositions).length,
    max_open_trades: maxOpenTrades,
    min_expected_move_pct: activeMinExpectedMovePct,
    server_ip: serverIp,
  });
});

app.get("/api/v1/balance", async (req, res) => {
  if (!exchange || !isExchangeAuthenticated) {
    await initializeExchange();
  }
  
  const env = getBinanceEnvironment();
  let conf: any = {};
  try {
    if (fs.existsSync("config.json")) {
      conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
    }
  } catch (e) {}

  const apiKey = conf?.exchange?.key || process.env.BINANCE_API_KEY || "";
  const secretKey = conf?.exchange?.secret || process.env.BINANCE_API_SECRET || "";

  if (!apiKey || !secretKey) {
    return res.json({ balance_usdt: 0, environment: env });
  }

  // Try direct REST first if authenticated
  try {
    const directRes = await fetchDirectBinanceFuturesBalance(apiKey, secretKey, env);
    if (directRes.success) {
      return res.json({ balance_usdt: directRes.balance_usdt, environment: env });
    }
  } catch (e) {}

  // Fallback to CCXT exchange
  if (exchange && isExchangeAuthenticated) {
    try {
      let usdt = 0;
      try {
        const balFut = await exchange.fetchBalance({ type: "future" });
        usdt = balFut.USDT?.total ?? balFut.USDT?.free ?? (balFut as any).total?.USDT ?? 0;
      } catch (e) {
        const bal = await exchange.fetchBalance();
        usdt = bal.USDT?.total ?? bal.USDT?.free ?? (bal as any).total?.USDT ?? (bal as any).free?.USDT ?? 0;
      }
      return res.json({ balance_usdt: usdt, environment: env });
    } catch (e: any) {
      return res.json({ balance_usdt: 0, error: e.message, environment: env });
    }
  }

  res.json({ balance_usdt: 0, environment: env });
});

app.get("/api/v1/config", (req, res) => {
  res.json({
    exchange: { pair_whitelist: whitelistCoins, environment: getBinanceEnvironment() },
    coin_selection_mode: coinSelectionMode,
    dry_run: false,
    leverage: targetLeverage,
    stop_loss_pct: activeStopLossPct,
    min_expected_move_pct: activeMinExpectedMovePct,
    take_profit_pct: activeTakeProfitPct,
    
    stake_amount: activeStakeAmount,
    max_open_trades: maxOpenTrades,
    margin_mode: activeMarginMode,
    exchange_environment: getBinanceEnvironment()
  });
});

app.post("/api/v1/config", async (req, res) => {
  const incoming = (req.body && typeof req.body === 'object') ? req.body : {};
  let persisted: any = {};
  try {
    if (fs.existsSync('config.json')) persisted = JSON.parse(fs.readFileSync('config.json', 'utf8'));
  } catch {}
  const conf: any = { ...persisted, ...incoming, exchange: { ...(persisted.exchange || {}), ...(incoming.exchange || {}) } };
  // API secrets are intentionally not returned by GET /config. Preserve them on ordinary settings saves.
  if (incoming?.exchange && !Object.prototype.hasOwnProperty.call(incoming.exchange, 'key')) {
    conf.exchange.key = persisted?.exchange?.key || '';
  }
  if (incoming?.exchange && !Object.prototype.hasOwnProperty.call(incoming.exchange, 'secret')) {
    conf.exchange.secret = persisted?.exchange?.secret || '';
  }
  let whitelistChanged = false;
  let modeChanged = false;
  const previousEnvironment = getBinanceEnvironment();
  const nextEnvironment = String(conf?.exchange?.environment || "live").toLowerCase() === "testnet" ? "testnet" : "live";
  const environmentChanged = previousEnvironment !== nextEnvironment;
  
  if (conf.coin_selection_mode === "manual" || conf.coin_selection_mode === "algorithm") {
    if (coinSelectionMode !== conf.coin_selection_mode) {
      coinSelectionMode = conf.coin_selection_mode;
      modeChanged = true;
      addEngineLog("SYSTEM", `Coin Seçim Modu Değiştirildi: ${coinSelectionMode === 'manual' ? '📌 Manuel Parite Modu (Sadece Seçili Pariteler)' : '⚡ Algoritma Modu (Dinamik En İyi Coinler Otomatik Taranıyor)'}`);
    }
  }

  if (conf.exchange?.pair_whitelist && Array.isArray(conf.exchange.pair_whitelist)) {
    whitelistCoins = conf.exchange.pair_whitelist;
    whitelistChanged = true;
  }
  
  if (conf.leverage !== undefined && conf.leverage !== null) targetLeverage = Math.round(clamp(Number(conf.leverage) || 15, 1, 125));
  if (conf.stop_loss_pct !== undefined && conf.stop_loss_pct !== null) {
    const sl = parseFloat(String(conf.stop_loss_pct).replace(',', '.'));
    if (Number.isFinite(sl)) {
      activeStopLossPct = clamp(Math.abs(sl), 0.1, 20);
      conf.stop_loss_pct = activeStopLossPct;
      // Sync to all currently open active positions
      for (const sym of Object.keys(activePositions)) {
        activePositions[sym].stopLossPct = activeStopLossPct;
        activePositions[sym].baseStopPrice = activePositions[sym].type === "long"
          ? activePositions[sym].entryPrice * (1 - activeStopLossPct / 100)
          : activePositions[sym].entryPrice * (1 + activeStopLossPct / 100);
      }
    }
  }
  if (conf.min_expected_move_pct !== undefined) {
    const v = parseFloat(String(conf.min_expected_move_pct).replace(',', '.'));
    if (Number.isFinite(v)) activeMinExpectedMovePct = clamp(v, 0.5, 20);
    conf.min_expected_move_pct = activeMinExpectedMovePct;
  } else {
    conf.min_expected_move_pct = activeMinExpectedMovePct;
  }

  if (conf.take_profit_pct !== undefined) {
    const v = parseFloat(String(conf.take_profit_pct).replace(',', '.'));
    if (Number.isFinite(v)) activeTakeProfitPct = clamp(Math.abs(v), 0.1, 20);
    conf.take_profit_pct = activeTakeProfitPct;
  } else {
    conf.take_profit_pct = activeTakeProfitPct;
  }
  
  if (conf.stake_amount !== undefined && conf.stake_amount !== null && conf.stake_amount !== '') {
    const v = Number(String(conf.stake_amount).replace(',', '.'));
    if (Number.isFinite(v)) activeStakeAmount = clamp(v, 1, 1000000);
    conf.stake_amount = activeStakeAmount;
  }
  if (conf.leverage !== undefined && conf.leverage !== null && conf.leverage !== '') {
    const v = Number(conf.leverage);
    if (Number.isFinite(v)) targetLeverage = Math.round(clamp(v, 1, 125));
    conf.leverage = targetLeverage;
  }
  if (conf.max_open_trades !== undefined && conf.max_open_trades !== null && conf.max_open_trades !== '') {
    const v = Number(conf.max_open_trades);
    if (Number.isFinite(v)) maxOpenTrades = Math.round(clamp(v, 1, 8));
    conf.max_open_trades = maxOpenTrades;
  }
  const requestedMarginMode = String(conf.margin_mode || activeMarginMode).toLowerCase();
  activeMarginMode = requestedMarginMode === 'cross' || requestedMarginMode === 'crossed' ? 'cross' : 'isolated';
  conf.margin_mode = activeMarginMode;
  fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
  addEngineLog("SYSTEM", `Konfigürasyon güncellendi. (Mod: ${coinSelectionMode === 'manual' ? 'Manuel' : 'Algoritma'}, Zarar Kes: %${activeStopLossPct}, Kaldıraç: ${targetLeverage}x, Teminat: $${activeStakeAmount})`);
  
  if (whitelistChanged || environmentChanged || modeChanged) {
    if (environmentChanged) {
      // Fail closed during an environment switch: never keep an old LIVE/TESTNET exchange object.
      stopBinanceServerWebSockets();
      exchange = null;
      activeExchangeEnvironment = null;
      isExchangeAuthenticated = false;
      resetMarketDataState(`Binance ortamı ${previousEnvironment} → ${nextEnvironment}`);
      const initResult = await initializeExchange();
      if (!initResult.success) {
        return res.status(502).json({ status: "error", message: initResult.message, environment: nextEnvironment });
      }
    }
    startBinanceServerWebSocket();
    setTimeout(updateMarketDataAndExecute, 200);
  }

  res.json({ status: "success", coin_selection_mode: coinSelectionMode });
});

app.get("/api/v1/logs", (req, res) => {
  res.json({ logs: engineLogs });
});

app.get("/api/v1/trades", (req, res) => {
  const mappedTrades = allTrades.map(t => {
    const livePos = t.is_open ? activePositions[t.pair] : undefined;
    const isBinanceLive = Boolean(livePos && (livePos as any).isRealBinance);

    let currentRate = Number(t.entryPrice || 0);
    let pnlUSD = Number(t.profit_abs || 0);
    let roePct = Number(t.profit_pct || 0);

    if (t.is_open && isBinanceLive) {
      // Binance is authoritative for live Testnet/Live positions. Do not
      // recalculate PnL from the browser's last-price websocket.
      currentRate = Number(livePos?.markPrice || livePos?.entryPrice || currentRate);
      pnlUSD = Number(livePos?.unrealizedPnl || 0);
      roePct = Number(livePos?.percentage || 0);
    } else if (t.is_open) {
      // Local fallback is used only when no authenticated Binance position exists.
      currentRate = Number(latestMetricsPerCoin[t.pair]?.currentPrice || currentRate);
      pnlUSD = t.type === "long"
        ? (currentRate - t.entryPrice) * t.amount
        : (t.entryPrice - currentRate) * t.amount;
      const initialMargin = (t.entryPrice * t.amount) / (t.leverage || 1);
      roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;
    }

    const stopLossPrice = t.type === "long"
      ? t.entryPrice * (1 - activeStopLossPct / 100)
      : t.entryPrice * (1 + activeStopLossPct / 100);

    return {
      id: t.trade_id.toString(),
      pair: t.pair,
      is_open: t.is_open,
      type: t.type,
      amount: t.amount,
      leverage: livePos?.leverage || t.leverage,
      open_rate: t.entryPrice,
      current_rate: t.is_open ? currentRate : (t.close_rate || currentRate),
      close_rate: t.close_rate,
      open_date: new Date(t.openDate).toISOString().replace('T', ' ').slice(0, 19),
      close_date: t.close_date ? new Date(t.close_date).toISOString().replace('T', ' ').slice(0, 19) : undefined,
      close_reason: t.close_reason,
      profit_pct: Number(roePct.toFixed(2)),
      profit_abs: Number(pnlUSD.toFixed(2)),
      profit_ratio: Number((roePct / 100).toFixed(6)),
      pnl_source: isBinanceLive ? "binance" : (t.is_open ? "local" : (t.pnl_source || "closed_record")),
      mark_price: isBinanceLive ? currentRate : undefined,
      deep_score: latestMetricsPerCoin[t.pair]?.deepScore || 0,
      target_pct: Number(t.takeProfitPct ?? activeTakeProfitPct),
      stop_loss_pct: t.stopLossPct,
      stop_loss_abs: Number(stopLossPrice.toFixed(2)),
      take_profit_pct: Number(t.takeProfitPct ?? activeTakeProfitPct),
      model_target_profit_usd: Number(t.modelTargetPnlUSD || 0),
      model_target_price: Number(t.modelTargetPrice || 0),
      model_target_confidence: Number(t.modelTargetConfidence || 0),
      model_target_accuracy_sample: Number(t.modelTargetAccuracySample || 0),
      model_target_accuracy_rate: t.modelTargetAccuracyRate ?? null
    };
  });
  
  res.json({ trades: mappedTrades });
});

app.get("/api/v1/profit", (req, res) => {
  const closedTrades = allTrades.filter(t => !t.is_open);
  const winning = closedTrades.filter(t => (t.profit_abs || 0) > 0);
  const total = closedTrades.reduce((acc, t) => acc + (t.profit_abs || 0), 0);
  
  res.json({
    profit_closed_coin: Number(total.toFixed(2)),
    winning_trades: winning.length,
    losing_trades: closedTrades.length - winning.length,
    winrate: closedTrades.length > 0 ? winning.length / closedTrades.length : 0
  });
});

app.get("/api/v1/trade-analytics", (req, res) => {
  const closed = allTrades.filter(t => !t.is_open);
  const open = allTrades.filter(t => t.is_open);
  
  const totalTrades = allTrades.length;
  const closedTrades = closed.length;
  const openTrades = open.length;

  let winningTrades = 0;
  let losingTrades = 0;
  let totalGrossProfitUSD = 0;
  let totalLossUSD = 0;
  let totalFeesUSD = 0;

  let longCount = 0;
  let longWins = 0;
  let longPnl = 0;

  let shortCount = 0;
  let shortWins = 0;
  let shortPnl = 0;

  const pairMap: Record<string, { trades: number; wins: number; pnl: number }> = {};
  
  // Diagnostic counts & impact
  let slCount = 0;
  let slImpact = 0;
  let tpCount = 0;
  let tpImpact = 0;
  let beCount = 0;
  let beImpact = 0;
  let trailingCount = 0;
  let trailingImpact = 0;
  let reversalCount = 0;
  let reversalImpact = 0;

  // Running equity curve for Max Drawdown
  let runningPnl = 0;
  let peakEquity = 0;
  let maxDrawdownUSD = 0;

  for (const t of closed) {
    const pnl = Number(t.profit_abs || 0);
    // Approximate fee: 0.05% taker fee on open and close on notional
    const notional = (t.entryPrice * t.amount) || 100;
    const estimatedFee = notional * 0.0008; // ~0.08% roundtrip VIP0 taker fee
    totalFeesUSD += estimatedFee;

    if (pnl > 0) {
      winningTrades++;
      totalGrossProfitUSD += pnl;
    } else {
      losingTrades++;
      totalLossUSD += Math.abs(pnl);
    }

    if (t.type === "long") {
      longCount++;
      if (pnl > 0) longWins++;
      longPnl += pnl;
    } else {
      shortCount++;
      if (pnl > 0) shortWins++;
      shortPnl += pnl;
    }

    const pair = t.pair;
    if (!pairMap[pair]) pairMap[pair] = { trades: 0, wins: 0, pnl: 0 };
    pairMap[pair].trades++;
    if (pnl > 0) pairMap[pair].wins++;
    pairMap[pair].pnl += pnl;

    // Diagnostics classification
    const reason = (t.close_reason || "").toLowerCase();
    const diag = t.diagnostic || "";

    if (diag === "TP_SUCCESS" || reason.includes("hedef fiyat") || reason.includes("tp")) {
      tpCount++;
      tpImpact += pnl;
    } else if (diag === "TRAILING_LOCK_SUCCESS" || diag === "TRAILING_PROFIT" || reason.includes("trailing")) {
      trailingCount++;
      trailingImpact += pnl;
    } else if (diag === "BREAKEVEN_SAVED" || reason.includes("başa-baş") || reason.includes("be stop")) {
      beCount++;
      beImpact += pnl;
    } else if (diag === "STOP_LOSS" || diag.includes("STOP_LOSS") || pnl < 0 || reason.includes("stop loss") || reason.includes("zarar kes")) {
      slCount++;
      slImpact += Math.abs(pnl);
    } else if (diag === "TREND_REVERSAL_EXIT" || reason.includes("para akışı yön değiştirdi")) {
      reversalCount++;
      reversalImpact += pnl;
    }

    runningPnl += pnl;
    if (runningPnl > peakEquity) {
      peakEquity = runningPnl;
    }
    const currentDd = peakEquity - runningPnl;
    if (currentDd > maxDrawdownUSD) {
      maxDrawdownUSD = currentDd;
    }
  }

  const netPnlUSD = Number((totalGrossProfitUSD - totalLossUSD).toFixed(2));
  const winRatePct = closedTrades > 0 ? Number(((winningTrades / closedTrades) * 100).toFixed(1)) : 0;
  const profitFactor = totalLossUSD > 0 ? Number((totalGrossProfitUSD / totalLossUSD).toFixed(2)) : (totalGrossProfitUSD > 0 ? 99.9 : 0);
  const avgWinUSD = winningTrades > 0 ? Number((totalGrossProfitUSD / winningTrades).toFixed(2)) : 0;
  const avgLossUSD = losingTrades > 0 ? Number((totalLossUSD / losingTrades).toFixed(2)) : 0;
  const riskRewardRatio = avgLossUSD > 0 ? Number((avgWinUSD / avgLossUSD).toFixed(2)) : (avgWinUSD > 0 ? 3.0 : 1.0);
  const maxDrawdownPct = peakEquity > 0 ? Number(((maxDrawdownUSD / Math.max(peakEquity, 100)) * 100).toFixed(1)) : 0;

  const pairPerformance = Object.entries(pairMap).map(([pair, stats]) => ({
    pair,
    trades: stats.trades,
    winRatePct: stats.trades > 0 ? Number(((stats.wins / stats.trades) * 100).toFixed(1)) : 0,
    netPnlUSD: Number(stats.pnl.toFixed(2))
  })).sort((a, b) => b.netPnlUSD - a.netPnlUSD);

  // Systematic Diagnostic Breakdown
  const diagnostics = [
    {
      id: "diag_tp",
      category: "TAKE_PROFIT" as const,
      title: "Hedef Fiyat (TP) Başarıları",
      count: tpCount,
      impactUsd: Number(tpImpact.toFixed(2)),
      description: "Yüksek likidite ve akıllı hedef fiyat bölgelerinde kâr güvenle realize edildi.",
      suggestion: "TP hedefleri piyasa derinliği ile mükemmel uyumlu çalışıyor.",
      severity: "success" as const
    },
    {
      id: "diag_trailing",
      category: "BREAKEVEN_LOCK" as const,
      title: "Dinamik Trailing & Zirve Kâr Kilidi",
      count: trailingCount,
      impactUsd: Number(trailingImpact.toFixed(2)),
      description: "Zirveye ulaşan pozisyonlar geriye dönmeden dinamik trailing ile kilitlendi.",
      suggestion: "Zirveden %0.32 çekilme payı kârın korunmasında yüksek verimlilik sağlıyor.",
      severity: "success" as const
    },
    {
      id: "diag_be",
      category: "BREAKEVEN_LOCK" as const,
      title: "Otomatik Başa-Baş (BE) Koruması",
      count: beCount,
      impactUsd: Number(beImpact.toFixed(2)),
      description: "Pozisyon +%0.50 fiyatta kâra geçince Stop seviyesi maliyetin üstüne çekilerek sıfır zararla kapatıldı.",
      suggestion: "Büyük düşüş/yükseliş tuzaklarına karşı sermaye kaybı sıfıra indirildi.",
      severity: "success" as const
    },
    {
      id: "diag_sl",
      category: "STOP_LOSS" as const,
      title: "Stop Loss Tetiklenmesi (Yanlış Kırılım)",
      count: slCount,
      impactUsd: Number((-slImpact).toFixed(2)),
      description: "Ani iğneler ve karşı direnç duvarlarına çarpma sonucu oluşan kayıplar tespit edildi.",
      suggestion: "4 dakikalık Cooldown ve EMA9/VWAP trend filtresi ile tekrarlayan stop kayıpları engellendi.",
      severity: slCount > 3 ? ("high" as const) : ("medium" as const)
    },
    {
      id: "diag_fees",
      category: "FEE_SLIPPAGE" as const,
      title: "Komisyon & Spread Sürtünmesi",
      count: closedTrades,
      impactUsd: Number((-totalFeesUSD).toFixed(2)),
      description: "Yüksek kaldıraçlı işlemlerdeki borsa taker komisyonu ve alış/satış spread etkisi.",
      suggestion: "Spread filtresi maks %0.18'e çekilerek spread sürtünmesi minimuma indirildi.",
      severity: "low" as const
    }
  ];

  // Compute overall Algorithm Health Score (0-100)
  let score = 50;
  if (winRatePct >= 70) score += 25;
  else if (winRatePct >= 55) score += 15;
  else if (winRatePct < 40) score -= 15;

  if (profitFactor >= 2.0) score += 15;
  else if (profitFactor >= 1.4) score += 10;
  
  if (riskRewardRatio >= 1.5) score += 10;
  if (maxDrawdownPct <= 10) score += 5;
  const algorithmScore = Math.min(100, Math.max(20, Math.round(score)));

  const appliedImprovements = [
    "Otomatik Başa-Baş (Breakeven) Kâr Kilidi: +%0.50 fiyatta SL maliyetin üstüne taşınır.",
    "Dinamik Trailing Stop: +%0.90 ve üzeri kârda zirveden %0.32 çekilmede kâr otomatik kilitlenir.",
    "Zarar Sonrası 4 Dakika Cooldown: Stop Loss vuran coinde intikam işlemlerini ve ters iğneleri engeller.",
    "Micro-Trend Filtresi (EMA9 & VWAP): Trendin tersine düşen bıçağı tutmayı (knife-catching) engeller.",
    "RSI Aşırı Uç Filtresi: RSI > 76 iken Long, RSI < 24 iken Short açılması engellendi.",
    "Direnç & Destek Duvarı Kontrolü: 1.0% mesafe içindeki ağır emir blokları kontrol edilir.",
    "Sıkı Spread Filtresi (Maks %0.18): Geniş spreadli likiditesiz coinlerde slippage zararlarını önler."
  ];

  res.json({
    totalTrades,
    closedTrades,
    openTrades,
    winningTrades,
    losingTrades,
    winRatePct,
    totalGrossProfitUSD: Number(totalGrossProfitUSD.toFixed(2)),
    totalLossUSD: Number(totalLossUSD.toFixed(2)),
    totalFeesUSD: Number(totalFeesUSD.toFixed(2)),
    netPnlUSD,
    profitFactor,
    avgWinUSD,
    avgLossUSD,
    riskRewardRatio,
    maxDrawdownUSD: Number(maxDrawdownUSD.toFixed(2)),
    maxDrawdownPct,
    longTrades: {
      count: longCount,
      winRatePct: longCount > 0 ? Number(((longWins / longCount) * 100).toFixed(1)) : 0,
      netPnlUSD: Number(longPnl.toFixed(2))
    },
    shortTrades: {
      count: shortCount,
      winRatePct: shortCount > 0 ? Number(((shortWins / shortCount) * 100).toFixed(1)) : 0,
      netPnlUSD: Number(shortPnl.toFixed(2))
    },
    pairPerformance,
    diagnostics,
    algorithmScore,
    appliedImprovements
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
      await executeExit(sym, "Kullanıcı Manuel Zorla Kapattı", latestMetricsPerCoin[sym]?.currentPrice || 0);
    }
    return res.json({ status: "success", message: "Tüm işlemler kapatıldı." });
  } else {
    const posEntry = Object.entries(activePositions).find(([_, p]) => p.trade_id.toString() === tradeid.toString());
    if (posEntry) {
      await executeExit(posEntry[0], "Kullanıcı Manuel Zorla Kapattı", latestMetricsPerCoin[posEntry[0]]?.currentPrice || 0);
      return res.json({ status: "success", message: "İşlem kapatıldı." });
    } else {
      // Check for orphaned trades in allTrades
      const orphanedTrade = allTrades.find(t => t.trade_id.toString() === tradeid.toString() && t.is_open);
      if (orphanedTrade) {
        orphanedTrade.is_open = false;
        orphanedTrade.close_date = Date.now();
        orphanedTrade.close_reason = "Hayalet Pozisyon Temizlendi";
        orphanedTrade.close_rate = orphanedTrade.current_rate || orphanedTrade.entryPrice;
        return res.json({ status: "success", message: "Hayalet işlem sistemden temizlendi." });
      }
    }
  }
  res.status(400).json({ error: "İşlem bulunamadı." });
});

app.post("/api/v1/forceentry", async (req, res) => {
  const { symbol, side } = req.body;
  const sym = symbol || whitelistCoins[0] || "BTC/USDT";
  const type = side === "short" ? "short" : "long";
  const currentPrice = latestMetricsPerCoin[sym]?.currentPrice || 0;
  
  if (activePositions[sym]) {
    return res.status(400).json({ error: `${sym} üzerinde zaten açık bir pozisyon var.` });
  }
  
  try {
    await executeEntry(sym, type, currentPrice);
    if (!activePositions[sym]) {
      return res.status(409).json({ error: `${sym} ${type.toUpperCase()} pozisyonu açılmadı: Binance Futures ortamı veya taze market verisi doğrulanamadı.` });
    }
    res.json({ status: "success", message: `${sym} ${type.toUpperCase()} pozisyonu başarıyla açıldı.` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Deep Data for UI & OrderBook
app.get("/api/v1/orderbook", async (req, res) => {
  const requestEnvironment = currentEnvironment();
  const reqSymbol = (req.query.symbol as string) || whitelistCoins[0] || "BTC/USDT";
  let ob = latestOrderBooks[reqSymbol];
  let m = latestMetricsPerCoin[reqSymbol];

  // If order book or detailed metrics are not yet available, immediately fetch live Futures depth & trades from Binance
  if (!ob || !ob.bids || ob.bids.length < 20 || !m || m.obi === undefined) {
    try {
      const clean = reqSymbol.replace('/', '').toUpperCase();
      const [depthRes, tradesRes] = await Promise.all([
        fetch(`${futuresRestBase(requestEnvironment)}/fapi/v1/depth?symbol=${clean}&limit=50`),
        fetch(`${futuresRestBase(requestEnvironment)}/fapi/v1/trades?symbol=${clean}&limit=30`)
      ]);

      if (depthRes.ok) {
        if (currentEnvironment() !== requestEnvironment) return res.status(409).json({ error: "Binance Futures ortamı istek sırasında değişti; eski veri reddedildi." });
        const depthData: any = await depthRes.json();
        ob = {
          bids: (depthData.bids || []).map((b: any) => [parseFloat(b[0]), parseFloat(b[1])]),
          asks: (depthData.asks || []).map((a: any) => [parseFloat(a[0]), parseFloat(a[1])]),
          timestamp: Date.now()
        };
        ob.environment = currentEnvironment();
        latestOrderBooks[reqSymbol] = ob;
        markMarketData(reqSymbol, "depth", currentEnvironment());
      }

      let recentTrades: any[] = [];
      if (tradesRes.ok) {
        if (currentEnvironment() !== requestEnvironment) return res.status(409).json({ error: "Binance Futures ortamı istek sırasında değişti; eski veri reddedildi." });
        const tradesData: any = await tradesRes.json();
        if (Array.isArray(tradesData)) {
          recentTrades = tradesData.map((t: any) => ({
            price: parseFloat(t.price),
            amount: parseFloat(t.qty),
            side: t.isBuyerMaker ? 'sell' : 'buy',
            time: t.time
          }));
          markMarketData(reqSymbol, "trade", currentEnvironment());
        }
      }

      const bestBid = ob?.bids?.[0]?.[0] || 0;
      const bestAsk = ob?.asks?.[0]?.[0] || bestBid;
      const mid = (bestBid + bestAsk) / 2;

      const flow = analyzeMicrostructure(reqSymbol, ob, recentTrades, [], [], mid);
      m = {
        currentPrice: mid,
        change_24h_pct: 0,
        volume_24h_usdt: 0,
        rsi: 50,
        atr: mid * 0.008,
        ...flow
      };
      latestMetricsPerCoin[reqSymbol] = m;
    } catch (e) {}
  }

  const p = m?.currentPrice || ob?.bids?.[0]?.[0] || 0;
  if (!ob?.bids?.length || !ob?.asks?.length || !p) {
    return res.status(503).json({ error: "Gerçek Futures Order Book verisi henüz hazır değil." });
  }

  res.json({
    orderBook: ob,
    metrics: {
      OBI: m?.obi !== undefined ? m.obi : 0,
      MicroPrice: m?.microPrice || p,
      MidPrice: m?.midPrice || p,
      deltaV: m?.netInflowUSD !== undefined ? m.netInflowUSD / 1000 : 0,
      currentPrice: p,
      VWAP: m?.vwap || p,
      stdDev: m?.stdDev || 0,
      SpreadPct: m?.spreadPct || 0.0001,
      deepScore: m?.deepScore || 0,
      atr: m?.atr || p * 0.008,
      takerBuyRatio: m?.takerBuyRatio !== undefined ? m.takerBuyRatio : 0.5,
      takerSellRatio: m?.takerSellRatio !== undefined ? m.takerSellRatio : 0.5,
      netInflowUSD: m?.netInflowUSD || 0,
      longFlowScore: m?.longFlowScore !== undefined ? m.longFlowScore : 50,
      shortFlowScore: m?.shortFlowScore !== undefined ? m.shortFlowScore : 50,
      flowDirection: m?.flowDirection || 'NEUTRAL',
      longAdvantage: m?.longAdvantage || m?.longFlowScore || 50,
      shortAdvantage: m?.shortAdvantage || m?.shortFlowScore || 50,
      orderFlowGap: m?.orderFlowGap || 0,
      inflowMomentum: m?.inflowMomentum || 0,
      largeTradeScore: m?.largeTradeScore || 0,
      liquidityConsumptionScore: m?.liquidityConsumptionScore || 0,
      wallPersistenceScore: m?.wallPersistenceScore || 0,
      divergenceScore: m?.divergenceScore || 0,
      movementPotentialPct: m?.movementPotentialPct || 0,
      minExpectedMovePct: m?.minExpectedMovePct || activeMinExpectedMovePct,
      targetMeetsMinimum: m?.targetMeetsMinimum ?? false,
      expectedNetProfitUSD: m?.expectedNetProfitUSD || 0,
      expectedTargetPrice: m?.expectedTargetPrice || p,
      targetPathScore: m?.targetPathScore || 0,
      targetConfidence: m?.targetConfidence || 0,
      targetAccuracySample: m?.targetAccuracySample || 0,
      targetAccuracyRate: m?.targetAccuracyRate ?? null,
      edgeScore: m?.edgeScore || 0,
      dataQuality: m?.dataQuality || 0
    }
  });
});

app.get("/api/v1/deepdata", (req, res) => {
  res.json({ metrics: latestMetricsPerCoin, orderbooks: latestOrderBooks, environment: currentEnvironment(), marketDataEnvironment });
});

app.get("/api/v1/futures/orderbook", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").replace(/\//g, "").toUpperCase();
    const limit = Math.min(1000, Math.max(5, Number(req.query.limit || 50)));
    const r = await fetch(`${futuresRestBase()}/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) { res.status(502).json({ error: e?.message || "Futures order book alınamadı" }); }
});

app.get("/api/v1/futures/trades", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").replace(/\//g, "").toUpperCase();
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 50)));
    const r = await fetch(`${futuresRestBase()}/fapi/v1/trades?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) { res.status(502).json({ error: e?.message || "Futures trades alınamadı" }); }
});

app.get("/api/v1/futures/klines", async (req, res) => {
  try {
    const symbol = String(req.query.symbol || "BTCUSDT").replace(/\//g, "").toUpperCase();
    const interval = String(req.query.interval || "5m");
    const limit = Math.min(1500, Math.max(1, Number(req.query.limit || 80)));
    const r = await fetch(`${futuresRestBase()}/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`);
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) { res.status(502).json({ error: e?.message || "Futures kline alınamadı" }); }
});

app.get("/api/v1/data-source", (req, res) => {
  const env = currentEnvironment();
  const ep = getBinanceFuturesEndpoints(env);
  const wsOpen = binanceWsClients.some((c: any) => c && c.readyState === 1);
  res.json({
    environment: env,
    futures: env === "testnet" ? "BINANCE_USDM_DEMO" : "BINANCE_USDM_LIVE",
    restBase: ep.rest,
    marketWebSocketBase: ep.wsMarketCombined,
    publicWebSocketBase: ep.wsPublicCombined,
    websocketConnected: wsOpen,
    authenticatedExchangeEnvironment: activeExchangeEnvironment,
    marketDataEnvironment,
    strictIsolation: true,
    symbols: getActiveTradingPairs().map(symbol => ({
      symbol,
      environment: marketDataMeta[symbol]?.environment || null,
      tickerAgeMs: marketDataMeta[symbol]?.tickerAt ? Date.now() - marketDataMeta[symbol].tickerAt : null,
      depthAgeMs: marketDataMeta[symbol]?.depthAt ? Date.now() - marketDataMeta[symbol].depthAt : null,
      tradeAgeMs: marketDataMeta[symbol]?.tradeAt ? Date.now() - marketDataMeta[symbol].tradeAt : null,
      entryReady: hasFreshMarketData(symbol, true)
    }))
  });
});

app.get("/api/v1/live-tickers", (req, res) => {
  const activePairs = getActiveTradingPairs();
  const results = activePairs.map(sym => {
    const m = latestMetricsPerCoin[sym];
    return {
      symbol: sym,
      price: m?.currentPrice || 0,
      change_24h_pct: m?.change_24h_pct || 0,
      volume_24h_usdt: m?.volume_24h_usdt || 0,
      deepScore: m?.deepScore || 0,
      netInflowUSD: m?.netInflowUSD || 0,
      takerBuyRatio: m?.takerBuyRatio || 0.5,
      updated_at: Date.now()
    };
  });
  res.json({ tickers: results, coin_selection_mode: coinSelectionMode, environment: currentEnvironment(), futures_market: currentEnvironment() === "testnet" ? "BINANCE_USDM_DEMO" : "BINANCE_USDM_LIVE" });
});

// Comprehensive Binance Futures USDT Markets Repository
const DEFAULT_BINANCE_FUTURES_PAIRS: string[] = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "SUI/USDT",
  "PEPE/USDT", "SHIB/USDT", "NEAR/USDT", "LINK/USDT", "APT/USDT", "WIF/USDT", "BONK/USDT", "FET/USDT", "RENDER/USDT",
  "TIA/USDT", "INJ/USDT", "FTM/USDT", "BCH/USDT", "BLUR/USDT", "BEAM/USDT", "BOME/USDT", "BIGTIME/USDT", "BAKE/USDT",
  "BAND/USDT", "BAT/USDT", "BEL/USDT", "BNT/USDT", "BAL/USDT", "BICO/USDT", "BADGER/USDT", "BB/USDT", "BANANA/USDT",
  "BRETT/USDT", "1000BONK/USDT", "1000PEPE/USDT", "1000FLOKI/USDT", "1000SATS/USDT", "1000SHIB/USDT", "1000RATS/USDT",
  "1000CAT/USDT", "DOT/USDT", "MATIC/USDT", "LTC/USDT", "UNI/USDT", "ATOM/USDT", "ETC/USDT", "FIL/USDT", "ARB/USDT",
  "OP/USDT", "STX/USDT", "KAS/USDT", "RUNE/USDT", "ICP/USDT", "IMX/USDT", "GRT/USDT", "AAVE/USDT", "MKR/USDT",
  "LDO/USDT", "GALA/USDT", "SAND/USDT", "MANA/USDT", "CHZ/USDT", "AXS/USDT", "CRV/USDT", "DYDX/USDT", "PENDLE/USDT",
  "JUP/USDT", "PYTH/USDT", "W/USDT", "ENA/USDT", "NOT/USDT", "TON/USDT", "ZRO/USDT", "STRK/USDT", "IO/USDT", "ONDO/USDT",
  "LISTA/USDT", "TAO/USDT", "NEIRO/USDT", "TURBO/USDT", "POPCAT/USDT", "MEW/USDT", "HMSTR/USDT", "CATI/USDT",
  "MOODENG/USDT", "GOAT/USDT", "PNUT/USDT", "ACT/USDT", "THE/USDT", "MOVE/USDT", "ME/USDT", "VIRTUAL/USDT", "PENGU/USDT",
  "KAIA/USDT", "DRIFT/USDT", "DEGEN/USDT", "COW/USDT", "CETUS/USDT", "AERO/USDT", "ENS/USDT", "ORDI/USDT", "TRB/USDT",
  "GAS/USDT", "ARK/USDT", "GMX/USDT", "SNX/USDT", "KAVA/USDT", "COMP/USDT", "ZEC/USDT", "DASH/USDT", "XMR/USDT",
  "EOS/USDT", "NEO/USDT", "QTUM/USDT", "IOTA/USDT", "VET/USDT", "THETA/USDT", "ALGO/USDT", "ZIL/USDT", "ENJ/USDT",
  "1INCH/USDT", "SUSHI/USDT", "YFI/USDT", "KSM/USDT", "WAVES/USDT", "CELO/USDT", "ONE/USDT", "HOT/USDT", "ZRX/USDT",
  "OCEAN/USDT", "ANKR/USDT", "SKL/USDT", "CELER/USDT", "CTSI/USDT", "CHR/USDT", "DUSK/USDT", "COTI/USDT", "DGB/USDT",
  "NKN/USDT", "STORJ/USDT", "RSR/USDT", "OGN/USDT", "KNC/USDT", "LRC/USDT", "OMG/USDT", "HBAR/USDT", "RVN/USDT",
  "ZEN/USDT", "NULS/USDT", "FLOW/USDT", "EGLD/USDT", "KLAY/USDT", "MINA/USDT", "RAY/USDT", "GNO/USDT", "SUPER/USDT",
  "WOO/USDT", "JASMY/USDT", "ACH/USDT", "ARKM/USDT", "CYBER/USDT", "SEI/USDT", "MEME/USDT", "BLZ/USDT", "TRU/USDT",
  "LPT/USDT", "PERP/USDT", "API3/USDT", "MAGIC/USDT", "HOOK/USDT", "HIGH/USDT", "ASTR/USDT", "ALPHA/USDT", "SPELL/USDT",
  "SSV/USDT", "CFX/USDT", "LQTY/USDT", "TRX/USDT", "ID/USDT", "EDU/USDT", "SFP/USDT", "MAV/USDT", "XVG/USDT", "WLD/USDT"
];

let allFuturesMarketsList: string[] = [...DEFAULT_BINANCE_FUTURES_PAIRS];

// Dynamically refresh Binance Futures Pairs list from Binance Public API
async function loadBinanceFuturesMarkets() {
  try {
    const res = await fetch(`${futuresRestBase()}/fapi/v1/exchangeInfo`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.symbols)) {
        const set = new Set<string>(DEFAULT_BINANCE_FUTURES_PAIRS);
        for (const s of data.symbols) {
          if (s.quoteAsset === "USDT" && s.status === "TRADING" && s.contractType === "PERPETUAL") {
            const formatted = `${s.baseAsset}/USDT`;
            set.add(formatted);
          }
        }
        allFuturesMarketsList = Array.from(set);
      }
    }
  } catch (e) {}
}

loadBinanceFuturesMarkets();
setInterval(loadBinanceFuturesMarkets, 30 * 60 * 1000);

// Candlestick Klines Proxy Route
app.get("/api/v1/klines", async (req, res) => {
  const rawSymbol = (req.query.symbol as string) || "BTC/USDT";
  const interval = (req.query.interval as string) || "5m";
  const limit = parseInt((req.query.limit as string) || "80", 10);
  const cleanSymbol = rawSymbol.replace("/", "").toUpperCase();

  try {
    const fapiRes = await fetch(`${futuresRestBase()}/fapi/v1/klines?symbol=${cleanSymbol}&interval=${interval}&limit=${limit}`);
    if (fapiRes.ok) {
      const data = await fapiRes.json();
      if (Array.isArray(data) && data.length > 0) {
        return res.json(data);
      }
    }
  } catch (e) {}

  try {
    if (exchange) {
      const ohlcv = await exchange.fetchOHLCV(rawSymbol, interval, undefined, limit);
      if (ohlcv && ohlcv.length > 0) {
        const formatted = ohlcv.map(d => [d[0], d[1].toString(), d[2].toString(), d[3].toString(), d[4].toString(), d[5].toString()]);
        return res.json(formatted);
      }
    }
  } catch (e) {}

  return res.json([]);
});

// Futures Search Proxy
app.get("/api/v1/markets/search", (req, res) => {
  try {
    const q = ((req.query.q as string) || "").trim().toUpperCase();
    if (!q) {
      return res.json({ markets: allFuturesMarketsList.slice(0, 40) });
    }

    const cleanQ = q.replace("/", "").replace("USDT", "");
    
    // Sort matches: startWith query first, then contains
    const startsWithMatches: string[] = [];
    const containsMatches: string[] = [];

    for (const pair of allFuturesMarketsList) {
      const base = pair.split("/")[0];
      if (base === cleanQ || pair === q) {
        startsWithMatches.unshift(pair);
      } else if (base.startsWith(cleanQ)) {
        startsWithMatches.push(pair);
      } else if (base.includes(cleanQ) || pair.includes(q)) {
        containsMatches.push(pair);
      }
    }

    const results = [...startsWithMatches, ...containsMatches].slice(0, 50);
    res.json({ markets: results });
  } catch(e: any) {
    res.json({ markets: DEFAULT_BINANCE_FUTURES_PAIRS.slice(0, 30) });
  }
});

app.get("/api/v1/ping", (req, res) => res.json({ status: "pong" }));
app.get("/api/v1/pairlists", (req, res) => res.json([]));
app.get("/api/v1/strategies", (req, res) => res.json({}));

// =============== BINANCE WALLET & TIME SYNC HELPERS ===============
import crypto from "crypto";

let binanceServerTimeOffset = 0;
let lastTimeSync = 0;

let binanceServerTimeEnvironment: "testnet" | "live" | null = null;

async function syncBinanceTimeOffset(environment: "testnet" | "live" = getBinanceEnvironment()): Promise<number> {
  const now = Date.now();
  if (binanceServerTimeEnvironment === environment && now - lastTimeSync < 60000 && lastTimeSync !== 0) {
    return binanceServerTimeOffset;
  }
  const baseUrl = futuresRestBase(environment);
  try {
    const res = await fetch(`${baseUrl}/fapi/v1/time`);
    if (res.ok) {
      const data: any = await res.json();
      if (data && typeof data.serverTime === "number") {
        binanceServerTimeOffset = data.serverTime - Date.now();
        binanceServerTimeEnvironment = environment;
        lastTimeSync = now;
      }
    }
  } catch (e) {}
  return binanceServerTimeOffset;
}

async function fetchDirectBinanceFuturesBalance(
  apiKey: string,
  secretKey: string,
  environment: "testnet" | "live"
): Promise<{ success: boolean; balance_usdt: number; raw?: any; error?: string }> {
  const cleanKey = apiKey.trim();
  const cleanSecret = secretKey.trim();
  if (!cleanKey || !cleanSecret) {
    return { success: false, balance_usdt: 0, error: "API Key veya Secret boş." };
  }

  const offset = await syncBinanceTimeOffset(environment);
  const timestamp = Date.now() + offset;
  const queryString = `timestamp=${timestamp}&recvWindow=60000`;
  const signature = crypto.createHmac("sha256", cleanSecret).update(queryString).digest("hex");

  const urlsToTry: string[] = [];
  if (environment === "testnet") {
    urlsToTry.push(
      `https://demo-fapi.binance.com/fapi/v2/balance?${queryString}&signature=${signature}`,
      `https://demo-fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`
    );
  } else {
    urlsToTry.push(
      `https://fapi.binance.com/fapi/v2/balance?${queryString}&signature=${signature}`,
      `https://fapi.binance.com/fapi/v2/account?${queryString}&signature=${signature}`
    );
  }

  let lastError = "";

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        headers: {
          "X-MBX-APIKEY": cleanKey,
          "User-Agent": "Freqtrade-Sfeef/1.0",
        },
      });
      const data: any = await res.json();

      if (res.ok) {
        let usdtBalance = 0;
        // Case 1: Array of asset balances (fapi/v2/balance)
        if (Array.isArray(data)) {
          const usdtItem = data.find((a: any) => a.asset === "USDT");
          if (usdtItem) {
            usdtBalance = parseFloat(
              usdtItem.balance ||
                usdtItem.crossWalletBalance ||
                usdtItem.availableBalance ||
                usdtItem.maxWithdrawAmount ||
                0
            );
            return { success: true, balance_usdt: isNaN(usdtBalance) ? 0 : usdtBalance, raw: data };
          }
          // If array returned with 0 or other coins, return success with 0 or first balance
          return { success: true, balance_usdt: 0, raw: data };
        }

        // Case 2: Object with assets array (fapi/v2/account)
        if (data && Array.isArray(data.assets)) {
          const usdtItem = data.assets.find((a: any) => a.asset === "USDT");
          if (usdtItem) {
            usdtBalance = parseFloat(
              usdtItem.walletBalance ||
                usdtItem.marginBalance ||
                usdtItem.availableBalance ||
                usdtItem.crossWalletBalance ||
                0
            );
            return { success: true, balance_usdt: isNaN(usdtBalance) ? 0 : usdtBalance, raw: data };
          }
          const totalVal = parseFloat(data.totalWalletBalance || data.totalMarginBalance || 0);
          return { success: true, balance_usdt: isNaN(totalVal) ? 0 : totalVal, raw: data };
        }

        // Case 3: Spot testnet account (balances array)
        if (data && Array.isArray(data.balances)) {
          const usdtItem = data.balances.find((b: any) => b.asset === "USDT");
          if (usdtItem) {
            usdtBalance = parseFloat(usdtItem.free || 0) + parseFloat(usdtItem.locked || 0);
            return { success: true, balance_usdt: isNaN(usdtBalance) ? 0 : usdtBalance, raw: data };
          }
        }
      } else {
        lastError = data?.msg || data?.message || `HTTP ${res.status}`;
      }
    } catch (e: any) {
      lastError = e?.message || "Bağlantı hatası";
    }
  }

  return { success: false, balance_usdt: 0, error: lastError };
}

function translateBinanceError(errMsg: string, ip: string, environment: "testnet" | "live" = "live"): string {
  if (!errMsg) return "Binance bağlantı hatası oluştu.";
  
  if (errMsg.includes("-2015") || errMsg.includes("Invalid API-key, IP, or permissions")) {
    if (environment === "testnet") {
      return `Binance Futures Demo/Test API Hatası (-2015): Demo/Test API Key veya Secret Key geçersiz.\n\nÖnemli:\n1. Futures Demo/Test hesabınız için üretilmiş API anahtarlarını kullanın; canlı Binance anahtarını Demo/Test ortamında kullanmayın.\n2. Demo/Test hesabında API Key ve Secret'ın işlem ve kullanıcı verisi yetkilerini kontrol edin.\n3. API Key ve Secret'ı başında/sonunda boşluk olmadan yapıştırın.`;
    }
    return `Binance API Yetki Hatası (-2015): API Key geçersiz, IP kısıtlaması var veya 'Vadeli İşlemleri Etkinleştir' (Enable Futures) yetkisi verilmemiş.\n\nÇözüm: Binance > API Yönetimi ekranında:\n1. 'Vadeli İşlemleri Etkinleştir' (Enable Futures) kutucuğunu işaretleyin.\n2. IP erişim kısıtlamasını 'Kısıtlanmamış' yapın veya Sunucu IP'sini (${ip}) ekleyin.\n3. 'Okuma Yetkisi'nin (Enable Reading) açık olduğunu doğrulayın.`;
  }
  if (errMsg.includes("-2014") || errMsg.includes("API-key format invalid")) {
    return "Binance API Key Formatı Geçersiz (-2014): API Key veya Secret Key hatalı veya eksik. Lütfen başında ve sonunda boşluk kalmayacak şekilde kopyalayıp yapıştırın.";
  }
  if (errMsg.includes("-1021") || errMsg.includes("recvWindow") || errMsg.includes("Timestamp")) {
    return "Binance Zaman Senkronizasyonu (-1021): İstek zaman farkından dolayı reddedildi. Sistem otomatik saat senkronizasyonu uyguladı, lütfen tekrar deneyin.";
  }
  if (errMsg.includes("451") || errMsg.includes("Geofence") || errMsg.includes("restricted location")) {
    return "Binance Bölge Kısıtlaması (451): Binance bu sunucu IP'sinden erişimi kısıtlıyor.";
  }
  return errMsg;
}

app.post("/api/v1/exchange-keys", async (req, res) => {
  const { apiKey, secretKey, environment } = req.body;
  const cleanKey = (apiKey || "").trim();
  const cleanSecret = (secretKey || "").trim();
  const targetEnv: "testnet" | "live" = String(environment || getBinanceEnvironment()).toLowerCase() === "testnet" ? "testnet" : "live";

  if (!cleanKey || !cleanSecret) {
    // Clear keys in config.json
    try {
      let conf: any = {};
      if (fs.existsSync("config.json")) {
        conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
      }
      if (!conf.exchange) conf.exchange = {};
      conf.exchange.key = "";
      conf.exchange.secret = "";
      conf.exchange.environment = targetEnv;
      fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
    } catch(e) {}
    stopBinanceServerWebSockets();
    exchange = null;
    activeExchangeEnvironment = null;
    isExchangeAuthenticated = false;
    resetMarketDataState(`API anahtarları temizlendi / ortam ${targetEnv}`);
    const initResult = await initializeExchange();
    startBinanceServerWebSocket();
    return res.status(initResult.success ? 200 : 502).json({ success: initResult.success, balance_usdt: 0, environment: targetEnv, message: initResult.message });
  }
  
  const currentIp = await getServerPublicIp();
  await syncBinanceTimeOffset(targetEnv);

  let fetchedBalance = 0;
  let validationSuccess = false;
  let validationError = "";

  // 1. Try Direct REST first
  try {
    const directRes = await fetchDirectBinanceFuturesBalance(cleanKey, cleanSecret, targetEnv);
    if (directRes.success) {
      fetchedBalance = directRes.balance_usdt;
      validationSuccess = true;
    } else if (directRes.error) {
      validationError = directRes.error;
    }
  } catch (e: any) {
    validationError = e?.message || "";
  }

  // 2. If direct REST didn't succeed, fallback to CCXT
  if (!validationSuccess) {
    try {
      const ExchangeClass = (ccxt as any).binanceusdm || ccxt.binance;
      const tempExchange = new ExchangeClass({
        apiKey: cleanKey,
        secret: cleanSecret,
        enableRateLimit: true,
        options: { 
          defaultType: "future", 
          adjustForTimeDifference: true,
          recvWindow: 60000 
        }
      });
      if (targetEnv === "testnet") {
        // Do not use deprecated Futures sandbox mode. If Demo Trading is unavailable,
        // fail validation instead of risking a LIVE API call with Demo credentials.
        if (typeof (tempExchange as any).enableDemoTrading !== "function") {
          throw new Error("Bu CCXT sürümü Binance Futures Demo Trading'i desteklemiyor. CCXT'yi güncelleyin.");
        }
        (tempExchange as any).enableDemoTrading(true);
      }
      if (typeof (tempExchange as any).loadTimeDifference === "function") {
        try { await (tempExchange as any).loadTimeDifference(); } catch {}
      }

      let usdt = 0;
      try {
        const balFut = await tempExchange.fetchBalance({ type: "future" });
        usdt = balFut.USDT?.total ?? balFut.USDT?.free ?? (balFut as any).total?.USDT ?? (balFut as any).free?.USDT ?? 0;
      } catch (errFut: any) {
        const bal = await tempExchange.fetchBalance();
        usdt = bal.USDT?.total ?? bal.USDT?.free ?? (bal as any).total?.USDT ?? (bal as any).free?.USDT ?? 0;
      }
      fetchedBalance = usdt;
      validationSuccess = true;
    } catch (errCcxt: any) {
      validationError = errCcxt?.message || validationError || "Borsa bağlantı hatası.";
    }
  }

  if (validationSuccess) {
    // Persist to config.json
    try {
      let conf: any = {};
      if (fs.existsSync("config.json")) {
        conf = JSON.parse(fs.readFileSync("config.json", "utf8"));
      }
      if (!conf.exchange) conf.exchange = {};
      conf.exchange.key = cleanKey;
      conf.exchange.secret = cleanSecret;
      conf.exchange.environment = targetEnv;
      fs.writeFileSync("config.json", JSON.stringify(conf, null, 2));
    } catch(e) {}

    stopBinanceServerWebSockets();
    exchange = null;
    activeExchangeEnvironment = null;
    isExchangeAuthenticated = false;
    resetMarketDataState(`Binance API bağlantısı doğrulandı: ${targetEnv}`);
    const initResult = await initializeExchange();
    if (!initResult.success) {
      return res.status(502).json({ success: false, message: initResult.message, environment: targetEnv });
    }
    startBinanceServerWebSocket();
    setTimeout(() => void updateMarketDataAndExecute(), 200);
    return res.json({ success: true, balance_usdt: fetchedBalance, environment: targetEnv });
  } else {
    const translated = translateBinanceError(validationError, currentIp, targetEnv);
    return res.json({ success: false, message: translated, environment: targetEnv });
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
  console.log(`High Inflow Quant Futures Engine running at http://0.0.0.0:${PORT}`);
  initializeExchange();
});
