import React, { useState, useEffect, useRef } from 'react';
import {
  BotState,
  BotMetrics,
  Trade,
  MarketPairInfo,
  Candle,
  StrategyInfo,
  LogEntry,
  Timeframe,
} from './types';
import {
  INITIAL_METRICS,
  INITIAL_TRADES,
  INITIAL_MARKETS,
  STRATEGIES,
  INITIAL_CONFIG_JSON,
  INITIAL_LOGS,
  generateCandles,
} from './data/initialData';
import { Header } from './components/Header';
import { TradingDashboard } from './components/TradingDashboard';
import { StrategyStudio } from './components/StrategyStudio';
import { PairlistsManager } from './components/PairlistsManager';
import { ConfigEditor } from './components/ConfigEditor';
import { ApiDocumentation } from './components/ApiDocumentation';
import { LogsViewer } from './components/LogsViewer';

export function App() {
  const [botState, setBotState] = useState<BotState>('stopped');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [serverIp, setServerIp] = useState<string>('Tespit ediliyor...');
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [metrics, setMetrics] = useState<BotMetrics>(INITIAL_METRICS);
  const [trades, setTrades] = useState<Trade[]>(INITIAL_TRADES);
  const [markets, setMarkets] = useState<MarketPairInfo[]>(INITIAL_MARKETS);

  useEffect(() => {
    // Fetch initial 24hr ticker data to hydrate INITIAL_MARKETS with real values immediately
    const fetchTickers = async () => {
      try {
        let tickerList: any[] = [];
        try {
          const res = await fetch('/api/v1/live-tickers');
          const json = await res.json();
          if (json && Array.isArray(json.tickers) && json.tickers.length > 0) {
            tickerList = json.tickers;
          }
        } catch (e) {}

        if (tickerList.length === 0) {
          const res = await fetch('/api/v1/live-tickers');
          const data = await res.json();
          if (Array.isArray(data)) {
            tickerList = data.map(d => ({
              symbol: d.symbol,
              price: parseFloat(d.lastPrice),
              change_24h_pct: parseFloat(d.priceChangePercent),
              volume_24h_usdt: parseFloat(d.quoteVolume),
              high_24h: parseFloat(d.highPrice),
              low_24h: parseFloat(d.lowPrice)
            }));
          }
        }

        if (tickerList.length > 0) {
          setMarkets(prev => {
            return prev.map(m => {
              const binanceSymbol = m.symbol.replace('/', '');
              const ticker = tickerList.find((d: any) => d.symbol === m.symbol || d.symbol === binanceSymbol);
              if (ticker) {
                const currentPrice = typeof ticker.price === 'number' ? ticker.price : parseFloat(ticker.price || ticker.lastPrice);
                const changePct = typeof ticker.change_24h_pct === 'number' ? ticker.change_24h_pct : parseFloat(ticker.change_24h_pct || ticker.priceChangePercent);
                const volumeQuote = typeof ticker.volume_24h_usdt === 'number' ? ticker.volume_24h_usdt : parseFloat(ticker.volume_24h_usdt || ticker.quoteVolume);
                
                livePricesRef.current.set(binanceSymbol, currentPrice);
                return {
                  ...m,
                  price: currentPrice || m.price,
                  change_24h_pct: changePct !== undefined && !isNaN(changePct) ? changePct : m.change_24h_pct,
                  volume_24h_usdt: volumeQuote || m.volume_24h_usdt,
                  high_24h: ticker.high_24h ? parseFloat(ticker.high_24h) : m.high_24h,
                  low_24h: ticker.low_24h ? parseFloat(ticker.low_24h) : m.low_24h
                };
              }
              return m;
            });
          });
        }
      } catch (e) {}
    };
    fetchTickers();
  }, []);
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const selectedPairRef = useRef(selectedPair);

  useEffect(() => {
    selectedPairRef.current = selectedPair;
  }, [selectedPair]);

  // Track last active trade so we only auto-switch once per new trade
  const [lastActiveTradeId, setLastActiveTradeId] = useState<string | null>(null);

  useEffect(() => {
    const openTrade = trades.find(t => t.is_open);
    if (openTrade && openTrade.id !== lastActiveTradeId) {
      if (openTrade.pair !== selectedPair) {
        setSelectedPair(openTrade.pair);
      }
      setLastActiveTradeId(openTrade.id);
    } else if (!openTrade && lastActiveTradeId !== null) {
      // If trade closed, clear the tracker so it can trigger again on next trade
      setLastActiveTradeId(null);
    }
  }, [trades, selectedPair, lastActiveTradeId]);

  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [strategies, setStrategies] = useState<Record<string, StrategyInfo>>(STRATEGIES);
  const [selectedStrategy, setSelectedStrategy] = useState('OrderFlow_Quantitative');
  const [configJson, setConfigJson] = useState(INITIAL_CONFIG_JSON);
  const [binanceEnvironment, setBinanceEnvironment] = useState<"live" | "testnet">("live");
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);

  const livePricesRef = useRef<Map<string, number>>(new Map());

  // Fetch Initial Config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/v1/config');
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setConfigJson(JSON.stringify(data, null, 2));
          setBinanceEnvironment(data.exchange_environment === "testnet" || data?.exchange?.environment === "testnet" ? "testnet" : "live");
          if (data.stake_amount) {
            setMetrics(prev => ({ 
              ...prev, 
              stake_amount: data.stake_amount === 'unlimited' ? ('unlimited' as any) : Number(data.stake_amount) 
            }));
          }
        }
      } catch (e) {}
    };
    fetchConfig();
  }, []);

  // Poll Backend Engine State & Logs
  useEffect(() => {
    const fetchEngineStatus = async () => {
      try {
        const [statusRes, logsRes, tradesRes, profitRes] = await Promise.all([
          fetch('/api/v1/status'),
          fetch('/api/v1/logs'),
          fetch('/api/v1/trades'),
          fetch('/api/v1/profit')
        ]);
        const statusData = await statusRes.json();
        const logsData = await logsRes.json();
        const tradesData = await tradesRes.json();
        const profitData = await profitRes.json();
        if (tradesData.trades) {
          setTrades(tradesData.trades.map((t: any) => {
            if (t.is_open) {
              const binanceSymbol = t.pair.replace('/', '');
              const liveRate = livePricesRef.current.get(binanceSymbol);
              if (liveRate) {
                  const pnlUSD = t.type === 'short' 
                    ? (t.open_rate - liveRate) * t.amount
                    : (liveRate - t.open_rate) * t.amount;
                  const initialMargin = (t.open_rate * t.amount) / (t.leverage || 1);
                  const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;
                  return {
                    ...t,
                    current_rate: liveRate,
                    profit_pct: Number(roePct.toFixed(2)),
                    profit_abs: Number(pnlUSD.toFixed(2)),
                    profit_ratio: roePct / 100,
                  };
              }
            }
            return t;
          }));
        }
        if (profitData) setMetrics(prev => ({ ...prev, total_pnl_usdt: profitData.profit_closed_coin, winning_trades: profitData.winning_trades, losing_trades: profitData.losing_trades, win_rate: profitData.winrate * 100 }));
        
        if (statusData.state) setBotState(statusData.state);
        if (statusData.server_ip) setServerIp(statusData.server_ip);
        
        if (logsData.logs && Array.isArray(logsData.logs)) {
          // Merge logs, preferring backend logs for new entries
          setLogs(prev => {
             const newLogs = [...logsData.logs];
             const oldLogs = prev.filter(p => !newLogs.find(n => n.id === p.id));
             return [...newLogs, ...oldLogs].slice(0, 50);
          });
        }
      } catch (e) {
         // Silently ignore fetch errors
      }
    };
    fetchEngineStatus();
    const interval = setInterval(fetchEngineStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // Binance Live Market Data WebSocket + Failover Polling
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isSubscribed = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const processTickData = (items: any[]) => {
      if (!Array.isArray(items) || items.length === 0) return;
      const tickMap = new Map<string, any>();
      
      items.forEach((item: any) => {
        const symbol = item.s || (item.symbol ? item.symbol.replace('/', '') : null);
        const price = item.c ? parseFloat(item.c) : (item.price || item.lastPrice ? parseFloat(item.price || item.lastPrice) : null);
        if (symbol && price) {
          tickMap.set(symbol, item);
          livePricesRef.current.set(symbol, price);
        }
      });

      // 1. Update Market Watchlist
      setMarkets((prevMarkets) => {
        let changed = false;
        const newMarkets = prevMarkets.map((m) => {
          const binanceSymbol = m.symbol.replace('/', '');
          if (tickMap.has(binanceSymbol)) {
            const tick = tickMap.get(binanceSymbol);
            const newPrice = parseFloat(tick.c || tick.price || tick.lastPrice);
            const openPrice = parseFloat(tick.o || tick.openPrice) || 0;
            const changePct = openPrice ? ((newPrice - openPrice) / openPrice) * 100 : (parseFloat(tick.change_24h_pct || tick.priceChangePercent) || m.change_24h_pct);
            const volumeQuote = parseFloat(tick.q || tick.volume_24h_usdt || tick.quoteVolume) || m.volume_24h_usdt;
            
            if (newPrice !== m.price || Math.abs(changePct - m.change_24h_pct) > 0.02) {
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

      // 2. Update Live Open Trades with exact ROE% and PnL
      setTrades((prevTrades) => {
        let changed = false;
        const newTrades = prevTrades.map((t) => {
          if (!t.is_open) return t;
          const binanceSymbol = t.pair.replace('/', '');
          if (tickMap.has(binanceSymbol)) {
            const tick = tickMap.get(binanceSymbol);
            const newRate = parseFloat(tick.c || tick.price || tick.lastPrice) || t.current_rate;
            if (newRate !== t.current_rate) {
              changed = true;
              const pnlUSD = t.type === 'short'
                ? (t.open_rate - newRate) * t.amount
                : (newRate - t.open_rate) * t.amount;
              const initialMargin = (t.open_rate * t.amount) / (t.leverage || 1);
              const roePct = initialMargin > 0 ? (pnlUSD / initialMargin) * 100 : 0;
              return {
                ...t,
                current_rate: newRate,
                profit_pct: Number(roePct.toFixed(2)),
                profit_abs: Number(pnlUSD.toFixed(2)),
                profit_ratio: roePct / 100,
              };
            }
          }
          return t;
        });
        return changed ? newTrades : prevTrades;
      });

      // 3. Update Chart Candles
      const currentPair = selectedPairRef.current;
      const binanceSymbolForCandle = currentPair.replace('/', '');
      if (tickMap.has(binanceSymbolForCandle)) {
        const tick = tickMap.get(binanceSymbolForCandle);
        const newPrice = parseFloat(tick.c || tick.price || tick.lastPrice);
        if (newPrice) {
          setCandles((prevCandles) => {
            if (prevCandles.length === 0) return prevCandles;
            const lastCandle = prevCandles[prevCandles.length - 1];
            if (lastCandle.close !== newPrice) {
              const updatedCandle = { ...lastCandle };
              updatedCandle.close = newPrice;
              if (newPrice > updatedCandle.high) updatedCandle.high = newPrice;
              if (newPrice < updatedCandle.low) updatedCandle.low = newPrice;
              return [
                ...prevCandles.slice(0, prevCandles.length - 1),
                updatedCandle
              ];
            }
            return prevCandles;
          });
        }
      }
    };

    const connectWebSocket = () => {
      if (!isSubscribed) return;
      try {
        ws = new WebSocket((binanceEnvironment === 'testnet' ? 'wss://stream.binancefuture.com/ws/!miniTicker@arr' : 'wss://fstream.binance.com/ws/!miniTicker@arr'));

        ws.onopen = () => {
          // Connected successfully
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data)) {
              processTickData(data);
            }
          } catch (e) {}
        };

        ws.onerror = () => {
          try { ws?.close(); } catch(e) {}
        };

        ws.onclose = () => {
          if (isSubscribed) {
            reconnectTimeout = setTimeout(connectWebSocket, 2000);
          }
        };
      } catch (e) {
        if (isSubscribed) {
          reconnectTimeout = setTimeout(connectWebSocket, 3000);
        }
      }
    };

    connectWebSocket();

    // Secondary ultra-reliable 1.5s polling loop (guarantees real-time data even if WS blocked on mobile)
    const pollInterval = setInterval(async () => {
      try {
        const [res, deepRes] = await Promise.all([
          fetch('/api/v1/live-tickers'),
          fetch('/api/v1/deepdata')
        ]);
        const data = await res.json();
        if (data.tickers && Array.isArray(data.tickers)) {
          processTickData(data.tickers);
        }
      } catch (e) {}
    }, 1500);

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (ws) {
        try { ws.close(); } catch(e) {}
      }
    };
  }, []);

  // Live API Balance Fetcher
  useEffect(() => {
    const fetchLiveBalance = async () => {
      try {
        const res = await fetch('/api/v1/balance');
        const data = await res.json();
        if (typeof data.balance_usdt === 'number') {
          setMetrics((prev) => ({ ...prev, balance_usdt: data.balance_usdt }));
        }
      } catch (e) {
        // Ignore fetch errors silently
      }
    };
    
    // Fetch immediately
    fetchLiveBalance();
    
    // Poll every 10 seconds
    const interval = setInterval(fetchLiveBalance, 10000);
    return () => clearInterval(interval);
  }, []);

  // Update candles when selected pair or timeframe changes, and refresh periodically
  useEffect(() => {
    let isMounted = true;
    const fetchKlines = async () => {
      try {
        let rawData: any[] = [];
        try {
          const res = await fetch(`/api/v1/klines?symbol=${encodeURIComponent(selectedPair)}&interval=${timeframe}&limit=80`);
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            rawData = json;
          }
        } catch (e) {}

        if (rawData.length === 0) {
          const binanceSymbol = selectedPair.replace('/', '');
          const res = await fetch(`/api/v1/futures/klines?symbol=${binanceSymbol}&interval=${timeframe}&limit=80`);
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            rawData = json;
          }
        }

        if (rawData.length > 0 && isMounted) {
          const formattedCandles = rawData.map((d: any) => ({
            time: new Date(d[0]).toISOString(),
            timestamp: typeof d[0] === 'number' ? d[0] : parseInt(d[0], 10),
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5]),
          }));
          setCandles(formattedCandles);
        }
      } catch (e) {
        if (isMounted && candles.length === 0) {
          setCandles(generateCandles(selectedPair, timeframe, 80));
        }
      }
    };

    fetchKlines();
    const interval = setInterval(fetchKlines, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedPair, timeframe]);

  // Handlers
  
  const handleForceCloseTrade = async (tradeId: string) => {
    try {
      const res = await fetch('/api/v1/forceexit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeid: tradeId })
      });
      const data = await res.json();
      if (data.status === 'success') {
         addLog('SYSTEM', 'İşlem başarıyla Binance üzerinden zorla kapatıldı.');
         // Update UI locally just to be fast, it will be overwritten by fetchTrades next tick
         setTrades((prev) =>
          prev.map((t) => {
            if (t.id === tradeId) {
              return {
                ...t,
                is_open: false,
                close_rate: t.current_rate,
                close_date: new Date().toISOString().replace('T', ' ').slice(0, 19),
                close_reason: 'Kullanıcı Manuel',
              };
            }
            return t;
          })
        );
      } else {
         addLog('ERROR', data.error || 'İşlem kapatılırken bir hata oluştu.');
      }
    } catch (e) {
      addLog('ERROR', 'Sunucuya bağlanılamadı. İşlem kapatılamadı.');
    }
  };

  const handleForceBuy = async (pair: string) => {
    try {
      addLog('TRADE', `[MANUEL EMİR] ${pair} LONG pozisyonu gönderiliyor...`);
      const res = await fetch('/api/v1/forceentry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: pair, side: 'long' }),
      });
      const data = await res.json();
      if (res.ok) {
        addLog('TRADE', `[POZİSYON AÇILDI] ${pair} LONG pozisyonu başarıyla oluşturuldu.`);
        // Refresh trades immediately
        const tradesRes = await fetch('/api/v1/trades');
        const tradesData = await tradesRes.json();
        if (tradesData.trades) setTrades(tradesData.trades);
      } else {
        addLog('ERROR', data.error || 'Pozisyon açılamadı.');
      }
    } catch (e) {
      addLog('ERROR', 'Sunucuya ulaşılamadı.');
    }
  };

  const handleForceSell = async (pair: string) => {
    try {
      addLog('TRADE', `[MANUEL EMİR] ${pair} SHORT pozisyonu gönderiliyor...`);
      const res = await fetch('/api/v1/forceentry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: pair, side: 'short' }),
      });
      const data = await res.json();
      if (res.ok) {
        addLog('TRADE', `[POZİSYON AÇILDI] ${pair} SHORT pozisyonu başarıyla oluşturuldu.`);
        // Refresh trades immediately
        const tradesRes = await fetch('/api/v1/trades');
        const tradesData = await tradesRes.json();
        if (tradesData.trades) setTrades(tradesData.trades);
      } else {
        addLog('ERROR', data.error || 'Pozisyon açılamadı.');
      }
    } catch (e) {
      addLog('ERROR', 'Sunucuya ulaşılamadı.');
    }
  };

  const handleReloadStrategy = () => {
    addLog('INFO', `Strateji ve yapılandırma JSON dosyası yeniden yüklendi: ${selectedStrategy}`);
  };

  const handleToggleWhitelist = (symbol: string) => {
    setMarkets((prev) =>
      prev.map((m) => (m.symbol === symbol ? { ...m, in_whitelist: !m.in_whitelist } : m))
    );
  };

  const handleToggleBlacklist = (symbol: string) => {
    setMarkets((prev) =>
      prev.map((m) => (m.symbol === symbol ? { ...m, in_blacklist: !m.in_blacklist } : m))
    );
  };

  const handleAddPair = (symbol: string) => {
    if (markets.some((m) => m.symbol === symbol)) return;
    const newMarket: MarketPairInfo = {
      symbol,
      base: symbol.split('/')[0] || 'CRYPTO',
      quote: 'USDT',
      price: 100.0,
      change_24h_pct: 1.5,
      volume_24h_usdt: 50000000,
      high_24h: 105.0,
      low_24h: 98.0,
      in_whitelist: true,
      in_blacklist: false,
      signal: 'BUY',
    };
    setMarkets((prev) => [...prev, newMarket]);
    addLog('INFO', `Beyaz listeye yeni parite eklendi: ${symbol}`);
  };

  const addLog = (level: LogEntry['level'], message: string) => {
    const entry: LogEntry = {
      id: Date.now().toString() + Math.random().toString(36).substring(2),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    };
    setLogs((prev) => [entry, ...prev.slice(0, 50)]);
  };

  const handleToggleBotState = async (newState: BotState) => {
    try {
      if (newState === 'running') {
        await fetch('/api/v1/start', { method: 'POST' });
        setBotState('running');
      } else {
        await fetch('/api/v1/stop', { method: 'POST' });
        setBotState('stopped');
      }
    } catch (e) {
      addLog('ERROR', 'Sunucuya bağlanılamadı. Motor durumu değiştirilemedi.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0e14] text-slate-100 flex flex-col">
      <Header
        botState={botState}
        metrics={metrics}
        selectedStrategy={selectedStrategy}
        serverIp={serverIp}
        onToggleBotState={handleToggleBotState}
        onReloadStrategy={handleReloadStrategy}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLogout={() => setShowLogoutModal(true)}
      />

      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#151921] border border-[#1e232f] rounded-xl shadow-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-white mb-2">Çıkış Yap</h3>
            <p className="text-slate-400 text-sm mb-6">
              Binance API anahtarlarınızı silerek cüzdandan çıkış yapmak istediğinize emin misiniz? (Bakiye 0$ olarak görünecektir).
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-[#1e232f] transition"
              >
                İptal
              </button>
              <button
                onClick={async () => {
                  try {
                    let parsed: any = { exchange: { key: '', secret: '' } };
                    try { parsed = JSON.parse(configJson); } catch (e) {}
                    if (!parsed.exchange) parsed.exchange = {};
                    parsed.exchange.key = '';
                    parsed.exchange.secret = '';
                    const newJson = JSON.stringify(parsed, null, 2);
                    setConfigJson(newJson);
                    await fetch('/api/v1/config', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(parsed)
                    });
                    await fetch('/api/v1/exchange-keys', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ apiKey: '', secretKey: '' })
                    });
                    addLog('SYSTEM', 'Cüzdandan çıkış yapıldı.');
                  } catch (e) {}
                  setShowLogoutModal(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white transition shadow-lg shadow-rose-500/20"
              >
                Evet, Çıkış Yap
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-6 flex-1 w-full overflow-x-hidden">
        {activeTab === 'dashboard' && (
          <TradingDashboard
            metrics={metrics}
            trades={trades}
            markets={markets}
            candles={candles}
            selectedPair={selectedPair}
            setSelectedPair={setSelectedPair}
            timeframe={timeframe}
            setTimeframe={setTimeframe}
            onForceCloseTrade={handleForceCloseTrade}
            logs={logs}
          />
        )}

        {activeTab === 'strategies' && (
          <StrategyStudio
            strategies={strategies}
            selectedStrategy={selectedStrategy}
            onSelectStrategy={setSelectedStrategy}
            onSaveStrategy={(name, updated) => setStrategies((prev) => ({ ...prev, [name]: updated }))}
          />
        )}

        {activeTab === 'pairlists' && (
          <PairlistsManager
            markets={markets}
            onToggleWhitelist={handleToggleWhitelist}
            onToggleBlacklist={handleToggleBlacklist}
            onAddPair={handleAddPair}
          />
        )}

        {activeTab === 'config' && (
          <ConfigEditor
            initialConfigJson={configJson}
            serverIp={serverIp}
            onBalanceUpdated={(bal) => setMetrics(prev => ({ ...prev, balance_usdt: bal }))}
            onSaveConfig={async (jsonStr) => {
              setConfigJson(jsonStr);
              try { const savedCfg = JSON.parse(jsonStr); setBinanceEnvironment(savedCfg?.exchange?.environment === 'testnet' ? 'testnet' : 'live'); } catch {}
              addLog('INFO', 'Node.js config.json parametreleri güncellendi');
              try {
                // First save the config
                await fetch('/api/v1/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: jsonStr
                });

                // Then try to validate exchange keys if they exist in the config
                const parsed = JSON.parse(jsonStr);
                
                if (parsed.stake_amount) {
                   setMetrics(prev => ({ 
                     ...prev, 
                     stake_amount: parsed.stake_amount === 'unlimited' ? ('unlimited' as any) : Number(parsed.stake_amount) 
                   }));
                }

                const apiKey = (parsed?.exchange?.key || '').trim();
                const secretKey = (parsed?.exchange?.secret || '').trim();

                if (apiKey && secretKey) {
                  const res = await fetch('/api/v1/exchange-keys', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey, secretKey, environment: parsed?.exchange?.environment || "live" })
                  });
                  const data = await res.json();
                  
                  if (data.success) {
                    if (typeof data.balance_usdt === 'number') {
                      setMetrics(prev => ({ ...prev, balance_usdt: data.balance_usdt }));
                    }
                    addLog('SYSTEM', `Binance Vadeli İşlemler API bağlandı! Güncel Bakiye: $${data.balance_usdt !== undefined ? Number(data.balance_usdt).toFixed(2) : '---'} USDT`);
                    alert(`Başarılı! Binance Vadeli İşlemler API bağlandı.\n\nVadeli Cüzdan Bakiyeniz: $${data.balance_usdt !== undefined ? Number(data.balance_usdt).toFixed(2) : '0.00'} USDT`);
                    
                    // Fetch live balance right away
                    try {
                      const bRes = await fetch('/api/v1/balance');
                      const bData = await bRes.json();
                      if (typeof bData.balance_usdt === 'number') {
                        setMetrics(prev => ({ ...prev, balance_usdt: bData.balance_usdt }));
                      }
                    } catch(e) {}
                  } else {
                    const errMsg = data.message || 'Bilinmeyen Hata';
                    addLog('ERROR', `Binance API hatası: ${errMsg}`);
                    alert(`HATA: Binance API doğrulanamadı!\n\nSebep: ${errMsg}\n\n💡 İpucu: Render.com kullanıyorsanız Binance ABD IP'lerini kısıtladığı için Render'da servisinizi 'Frankfurt (Almanya)' bölgesinde açtığınızdan emin olun.`);
                  }
                } else if (!apiKey && !secretKey) {
                  addLog('SYSTEM', 'Binance API bağlantısı kesildi.');
                  setMetrics(prev => ({ ...prev, balance_usdt: 0 }));
                }

              } catch (e) {
                addLog('ERROR', 'Sunucuya bağlanılamadı veya işlem başarısız oldu.');
              }
            }}
          />
        )}

        {activeTab === 'api' && <ApiDocumentation />}

        {activeTab === 'logs' && (
          <LogsViewer logs={logs} onClearLogs={() => setLogs([])} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e232f] bg-[#151921] py-4 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap justify-between items-center gap-2">
          <span>freqtrade sfeef v2024.8 — Açık Kaynaklı Kripto Algoritmik Ticaret Aracı</span>
          <span>Node.js / Express / React Fullstack Web Uygulaması</span>
        </div>
      </footer>
    </div>
  );
}
