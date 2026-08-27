import React, { useState, useEffect } from 'react';
import { Settings, Save, Search, X, CheckCircle2, AlertCircle, Zap, Shield, Target, Eye, EyeOff, Globe, Copy, Check, RefreshCw } from 'lucide-react';

interface ConfigEditorProps {
  initialConfigJson: string;
  onSaveConfig: (jsonString: string) => Promise<void>;
  serverIp?: string;
  onBalanceUpdated?: (balance: number) => void;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({
  initialConfigJson,
  onSaveConfig,
  serverIp = 'Tespit ediliyor...',
  onBalanceUpdated,
}) => {
  const [parsedConfig, setParsedConfig] = useState<any>({});
  const [stakeAmount, setStakeAmount] = useState<string>("25");
  const [leverage, setLeverage] = useState<string>("15");
  const [maxOpenTrades, setMaxOpenTrades] = useState<string>("1");
  const [minExpectedMovePct, setMinExpectedMovePct] = useState<string>("5");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Coin Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // API Key Visibility & Testing
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string; balance?: number } | null>(null);
  const [copiedIp, setCopiedIp] = useState(false);

  useEffect(() => {
    try {
      if (initialConfigJson) {
        const cfg = JSON.parse(initialConfigJson);
        setParsedConfig(cfg);
        if (cfg.stake_amount !== undefined && cfg.stake_amount !== null) {
          setStakeAmount(String(cfg.stake_amount));
        }
        if (cfg.leverage !== undefined && cfg.leverage !== null) {
          setLeverage(String(cfg.leverage));
        }
        if (cfg.max_open_trades !== undefined && cfg.max_open_trades !== null) {
          setMaxOpenTrades(String(cfg.max_open_trades));
        }
        if (cfg.min_expected_move_pct !== undefined && cfg.min_expected_move_pct !== null) {
          setMinExpectedMovePct(String(cfg.min_expected_move_pct));
        }
      }
    } catch(e) {}
  }, [initialConfigJson]);

  const handleCopyIp = () => {
    if (serverIp && serverIp !== 'Tespit ediliyor...') {
      navigator.clipboard.writeText(serverIp);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
    }
  };

  const handleTestApi = async () => {
    const key = (parsedConfig?.exchange?.key || "").trim();
    const secret = (parsedConfig?.exchange?.secret || "").trim();
    if (!key || !secret) {
      setApiTestResult({
        success: false,
        message: "Lütfen hem API Key hem de Secret Key alanlarını doldurun."
      });
      return;
    }

    setIsTestingApi(true);
    setApiTestResult(null);

    try {
      const res = await fetch('/api/v1/exchange-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key, secretKey: secret, environment: parsedConfig?.exchange?.environment || "live" })
      });
      const data = await res.json();
      if (data.success) {
        const bal = typeof data.balance_usdt === 'number' ? data.balance_usdt : 0;
        setApiTestResult({
          success: true,
          message: `Bağlantı Başarılı! Binance Vadeli Cüzdan Bakiyeniz: $${bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`,
          balance: bal
        });
        if (onBalanceUpdated) onBalanceUpdated(bal);
      } else {
        setApiTestResult({
          success: false,
          message: data.message || "Binance API anahtarları doğrulanamadı."
        });
      }
    } catch (e: any) {
      setApiTestResult({
        success: false,
        message: "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin."
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    
    let isCancelled = false;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/v1/markets/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data && Array.isArray(data.markets)) {
            setSearchResults(data.markets);
          }
        }
      } catch(e) {}
      if (!isCancelled) setIsSearching(false);
    }, 60);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleUpdate = (field: string, value: any, parent?: string) => {
    const updated = { ...parsedConfig };
    if (parent) {
       if (!updated[parent]) updated[parent] = {};
       updated[parent][field] = value;
    } else {
       updated[field] = value;
    }
    setParsedConfig(updated);
  };

  const handleAddCoin = (coin: string) => {
    const formatted = coin.trim().toUpperCase().includes('/') ? coin.trim().toUpperCase() : `${coin.trim().toUpperCase()}/USDT`;
    const updated = { ...parsedConfig };
    if (!updated.exchange) updated.exchange = {};
    if (!updated.exchange.pair_whitelist) updated.exchange.pair_whitelist = [];
    if (!updated.exchange.pair_whitelist.includes(formatted)) {
       updated.exchange.pair_whitelist.push(formatted);
    }
    setParsedConfig(updated);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleRemoveCoin = (coin: string) => {
    const updated = { ...parsedConfig };
    if (updated.exchange?.pair_whitelist) {
       updated.exchange.pair_whitelist = updated.exchange.pair_whitelist.filter((c: string) => c !== coin);
    }
    setParsedConfig(updated);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchResults.length > 0) {
        handleAddCoin(searchResults[0]);
      } else if (searchQuery.trim()) {
        handleAddCoin(searchQuery.trim());
      }
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    try {
      const finalStake = stakeAmount.trim() === '' ? 25 : parseFloat(stakeAmount) || 25;
      const finalLeverage = leverage.trim() === '' ? 15 : parseInt(leverage, 10) || 15;
      const finalMaxOpenTrades = maxOpenTrades.trim() === '' ? 1 : parseInt(maxOpenTrades, 10) || 1;
      const rawMinMove = minExpectedMovePct.trim() === '' ? 5 : parseFloat(minExpectedMovePct.replace(',', '.')) || 5;
      const finalMinExpectedMovePct = Math.min(Math.max(rawMinMove, 1), 20);
      
      const updated = {
        ...parsedConfig,
        stake_amount: finalStake,
        leverage: Math.min(Math.max(finalLeverage, 1), 125),
        max_open_trades: Math.max(finalMaxOpenTrades, 1),
        min_expected_move_pct: finalMinExpectedMovePct
      };

      setStakeAmount(String(updated.stake_amount));
      setLeverage(String(updated.leverage));
      setMaxOpenTrades(String(updated.max_open_trades));
      setMinExpectedMovePct(String(updated.min_expected_move_pct));
      setParsedConfig(updated);

      await onSaveConfig(JSON.stringify(updated, null, 2));
      setSuccess("Konfigürasyon başarıyla kaydedildi.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const currentCoins = parsedConfig?.exchange?.pair_whitelist || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-2 border-b border-[#1e232f]">
        <h2 className="text-lg font-bold flex items-center space-x-2 text-white">
          <Settings className="w-5 h-5 text-emerald-400" />
          <span>Sistem Sistem & Algoritma Yapılandırması Algoritma Ayarları</span>
        </h2>
        <button
          onClick={handleSave}
          className="flex items-center space-x-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm transition shadow-lg shadow-emerald-500/20"
        >
          <Save className="w-4 h-4" />
          <span>Değişiklikleri Kaydet</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/40 text-rose-300 rounded-lg text-sm flex items-center space-x-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 rounded-lg text-sm flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{success}</span>
        </div>
      )}

      {/* COIN SELECTION */}
      <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-white flex items-center space-x-2">
            <Search className="w-4 h-4 text-emerald-400" />
            <span>Futures Parite Seçimi (Binance USDT-M)</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            {currentCoins.length} Parite Seçili
          </span>
        </div>
        
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setTimeout(() => setIsInputFocused(false), 200)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Coin baş harfi veya adı yazın... (Örn: B, SOL, SUI, DOGE, BTC)"
              className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg pl-9 pr-10 py-3 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 placeholder-slate-500 font-mono transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setSearchResults([]); }}
                className="absolute right-3 text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown List */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#12161f] border border-slate-700/80 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-[#1e232f] backdrop-blur-md">
              <div className="px-3 py-1.5 bg-[#0b0e14]/80 text-[11px] font-mono text-slate-400 flex justify-between items-center sticky top-0">
                <span>Eşleşen Binance Futures Pariteleri ({searchResults.length})</span>
                <span className="text-[10px] text-emerald-400">Eklemek için tıklayın</span>
              </div>
              {searchResults.map((pair) => {
                const isSelected = currentCoins.includes(pair);
                return (
                  <div 
                    key={pair} 
                    className={`px-4 py-2.5 flex items-center justify-between cursor-pointer transition ${
                      isSelected 
                        ? 'bg-emerald-500/10 text-emerald-300' 
                        : 'hover:bg-emerald-500/20 text-slate-200 hover:text-white'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleAddCoin(pair);
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-sm">{pair}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">PERP</span>
                    </div>
                    {isSelected ? (
                      <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Eklendi</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 hover:text-emerald-400 font-mono">+ Ekle</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Add Popular Preset Chips */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-slate-400 block font-medium">Hızlı Popüler Pariteler:</span>
          <div className="flex flex-wrap gap-1.5">
            {["BTC/USDT", "ETH/USDT", "SOL/USDT", "SUI/USDT", "BNB/USDT", "XRP/USDT", "DOGE/USDT", "ADA/USDT", "PEPE/USDT", "AVAX/USDT", "NEAR/USDT", "LINK/USDT"].map((p) => {
              const isAdded = currentCoins.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => isAdded ? handleRemoveCoin(p) : handleAddCoin(p)}
                  className={`text-[11px] font-mono px-2.5 py-1 rounded-lg border transition ${
                    isAdded 
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                      : 'bg-[#0b0e14] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                  }`}
                >
                  {isAdded ? `✓ ${p}` : `+ ${p}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Coins Tag List */}
        <div className="pt-2 border-t border-[#1e232f]">
          <div className="text-xs font-semibold text-slate-300 mb-2">Botun İşlem Yapacağı Seçili Pariteler:</div>
          <div className="flex flex-wrap gap-2">
            {currentCoins.map((coin: string) => (
              <div key={coin} className="flex items-center space-x-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono shadow-sm">
                <span>{coin}</span>
                <button 
                  type="button"
                  onClick={() => handleRemoveCoin(coin)} 
                  className="hover:text-rose-400 transition ml-1 p-0.5"
                  title={`${coin} paritesini kaldır`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {currentCoins.length === 0 && (
              <span className="text-amber-400/80 text-xs italic bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                Henüz coin seçilmedi. Arama kutusundan arayarak veya hızlı butonlardan en az 1 parite ekleyin.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* TRADING PARAMS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Mod & Kaldıraç</span>
            </h3>
            
            <div>
               <div className="flex items-center justify-between mb-1.5">
                 <label className="text-xs font-semibold text-slate-300">İşlem Başına Tutar (USD - Marjin)</label>
                 <span className="text-[11px] font-mono text-emerald-400 font-bold">${stakeAmount || '0'} USDT</span>
               </div>
               <div className="relative">
                 <input 
                    type="number"
                    min="1"
                    step="any"
                    value={stakeAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStakeAmount(val);
                      const num = parseFloat(val);
                      if (!isNaN(num)) {
                        handleUpdate("stake_amount", num);
                      }
                    }}
                    placeholder="Örn: 25"
                    className="w-full bg-[#0b0e14] border border-slate-700 text-white font-mono text-sm rounded-lg p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                 />
               </div>
               <p className="text-[10px] text-slate-500 mt-1 mb-4">Bir işleme girecek net nakit miktarıdır (Kaldıraç dahil DEĞİLDİR).</p>
            </div>

            <div>
               <div className="flex items-center justify-between mb-1.5">
                 <label className="text-xs font-semibold text-slate-300">Kaldıraç (1x - 125x)</label>
                 <span className="text-[11px] font-mono text-emerald-400 font-bold">{leverage || '1'}x Kaldıraç</span>
               </div>
               <div className="relative">
                 <input 
                    type="number"
                    min="1"
                    max="125"
                    value={leverage}
                    onChange={(e) => {
                      const val = e.target.value;
                      setLeverage(val);
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        handleUpdate("leverage", num);
                      }
                    }}
                    placeholder="Örn: 15"
                    className="w-full bg-[#0b0e14] border border-slate-700 text-white font-mono text-sm rounded-lg p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                 />
               </div>
               <p className="text-[10px] text-slate-500 mt-1">Kâr/hedef hareket filtresi 1x bazlıdır; kaldıraç hedef yüzdesini değiştirmez, gerçek PnL'yi büyütür.</p>
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">Maksimum Açık İşlem Sayısı</label>
               <input 
                    type="number"
                    min="1"
                    max="8"
                    value={maxOpenTrades}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMaxOpenTrades(val);
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        handleUpdate("max_open_trades", num);
                      }
                    }}
                    placeholder="Örn: 1"
                    className="w-full bg-[#0b0e14] border border-slate-700 text-white font-mono text-sm rounded-lg p-3 focus:outline-none focus:border-emerald-500 transition-colors"
                 />
               <p className="text-[10px] text-slate-500 mt-1">Aynı anda en fazla kaç coine işlem açılabileceği (Örn: 1).</p>
            </div>

            <div>
               <div className="flex items-center justify-between mb-1.5">
                 <label className="text-xs font-semibold text-slate-300">Minimum Beklenen Hareket / Kâr Hedefi (1x)</label>
                 <span className="text-[11px] font-mono text-cyan-400 font-bold">%{minExpectedMovePct || '5'}</span>
               </div>
               <input
                  type="number"
                  min="1"
                  max="20"
                  step="0.5"
                  value={minExpectedMovePct}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMinExpectedMovePct(val);
                    const num = parseFloat(val.replace(',', '.'));
                    if (!isNaN(num)) handleUpdate("min_expected_move_pct", num);
                  }}
                  placeholder="Örn: 5"
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white font-mono text-sm rounded-lg p-3 focus:outline-none focus:border-cyan-500 transition-colors"
               />
               <p className="text-[10px] text-slate-500 mt-1">Pozisyon açmadan önce 1x bazında beklenen fiyat hareketi en az bu yüzde olmalı. Kaldıraç bu eşiği değiştirmez; yalnızca PnL'yi büyütür.</p>
            </div>
          </div>

          <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Risk & Hedef Yönetimi</span>
            </h3>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">Manuel Zarar Kes (Stop Loss %)</label>
               <input 
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={parsedConfig?.stop_loss_pct !== undefined ? parsedConfig.stop_loss_pct : 1.5}
                  onChange={(e) => handleUpdate("stop_loss_pct", e.target.value)}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3 focus:border-emerald-500"
                  placeholder="Örn: 1.5"
               />
               <p className="text-[10px] text-slate-500 mt-1">Sadece zarar koruması devrededir, izleyen stop kapalıdır.</p>
            </div>
          </div>
      </div>
      
      {/* BINANCE API CREDENTIALS & DIAGNOSTICS */}
      <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-white flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Binance Vadeli İşlemler (Futures) API Kimlik Bilgileri</span>
          </h3>
          <button
            type="button"
            onClick={handleTestApi}
            disabled={isTestingApi || !parsedConfig?.exchange?.key || !parsedConfig?.exchange?.secret}
            className="flex items-center space-x-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingApi ? 'animate-spin' : ''}`} />
            <span>{isTestingApi ? 'Doğrulanıyor...' : 'Bağlantıyı Test Et'}</span>
          </button>
        </div>

        <div className="bg-[#0b0e14] border border-slate-700 rounded-lg p-4">
          <label className="block text-xs font-semibold text-slate-300 mb-2">Binance Futures Ortamı</label>
          <select
            value={parsedConfig?.exchange?.environment || "live"}
            onChange={(e) => handleUpdate("environment", e.target.value, "exchange")}
            className="w-full bg-[#151921] border border-slate-700 text-white text-sm rounded-lg p-3 focus:outline-none focus:border-emerald-500"
          >
            <option value="testnet">TESTNET — Sanal para / gerçek emir akışı testi</option>
            <option value="live">LIVE — Gerçek para</option>
          </select>
          <p className="text-[10px] text-amber-300 mt-2">TESTNET seçildiğinde yalnızca Testnet API anahtarını kullanın. Live anahtarlar Testnet ile değiştirilemez.</p>
        </div>

        {/* API Key and Secret Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">API Key</label>
            <div className="relative">
              <input 
                type={showApiKey ? "text" : "password"}
                value={parsedConfig?.exchange?.key || ""}
                onChange={(e) => handleUpdate("key", e.target.value, "exchange")}
                placeholder="Binance API Key..."
                className="w-full bg-[#0b0e14] border border-slate-700 text-white font-mono text-xs sm:text-sm rounded-lg p-3 pr-10 focus:outline-none focus:border-emerald-500 transition-colors"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">API Secret</label>
            <div className="relative">
              <input 
                type={showSecretKey ? "text" : "password"}
                value={parsedConfig?.exchange?.secret || ""}
                onChange={(e) => handleUpdate("secret", e.target.value, "exchange")}
                placeholder="Binance API Secret..."
                className="w-full bg-[#0b0e14] border border-slate-700 text-white font-mono text-xs sm:text-sm rounded-lg p-3 pr-10 focus:outline-none focus:border-emerald-500 transition-colors"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
              >
                {showSecretKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Live Test Feedback */}
        {apiTestResult && (
          <div className={`p-4 rounded-xl text-xs sm:text-sm font-mono border whitespace-pre-line leading-relaxed ${
            apiTestResult.success 
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
          }`}>
            <div className="flex items-start space-x-2">
              {apiTestResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">{apiTestResult.message}</div>
            </div>
          </div>
        )}

        {/* Binance Checklist Guide */}
        <div className="bg-[#0b0e14] border border-[#1e232f] p-4 rounded-xl space-y-2">
          <div className="text-xs font-bold text-slate-300 mb-1">Binance API Kurulum Kontrol Listesi:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div className="flex items-center space-x-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Vadeli İşlemleri Etkinleştir</strong> (Enable Futures) AÇIK</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Okuma Yetkisi</strong> (Enable Reading) AÇIK</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-amber-400 font-bold">⚠</span>
              <span><strong>IP Kısıtlaması</strong>: Kısıtlanmamış veya Sunucu IP</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="text-rose-400 font-bold">✕</span>
              <span><strong>Para Çekme (Withdrawal)</strong>: KESİNLİKLE KAPALI</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
