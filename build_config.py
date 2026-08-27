import os

new_config_code = """
import React, { useState, useEffect } from 'react';
import { Settings, Save, Search, X, CheckCircle2, AlertCircle, Zap, Shield, Target } from 'lucide-react';

interface ConfigEditorProps {
  initialConfigJson: string;
  onSaveConfig: (jsonString: string) => Promise<void>;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({
  initialConfigJson,
  onSaveConfig,
}) => {
  const [parsedConfig, setParsedConfig] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Coin Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    try {
      if (initialConfigJson) {
         setParsedConfig(JSON.parse(initialConfigJson));
      }
    } catch(e) {}
  }, [initialConfigJson]);

  useEffect(() => {
    if (!searchQuery || searchQuery.length < 1) {
       setSearchResults([]);
       return;
    }
    const timer = setTimeout(async () => {
       setIsSearching(true);
       try {
          const res = await fetch(`/api/v1/markets/search?q=${searchQuery}`);
          const data = await res.json();
          if (data && data.markets) setSearchResults(data.markets);
       } catch(e) {}
       setIsSearching(false);
    }, 500);
    return () => clearTimeout(timer);
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
    const updated = { ...parsedConfig };
    if (!updated.exchange) updated.exchange = {};
    if (!updated.exchange.pair_whitelist) updated.exchange.pair_whitelist = [];
    if (!updated.exchange.pair_whitelist.includes(coin)) {
       updated.exchange.pair_whitelist.push(coin);
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

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    try {
      await onSaveConfig(JSON.stringify(parsedConfig, null, 2));
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
          <span>Sistem & Algoritma Yapılandırması</span>
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
        <h3 className="font-bold text-sm text-white flex items-center space-x-2 mb-4">
          <Search className="w-4 h-4 text-emerald-400" />
          <span>Futures Parite Seçimi</span>
        </h3>
        
        <div className="relative">
           <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Binance Futures'da ara... Örn: SOL, SUI, DOGE"
              className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3 focus:border-emerald-500 placeholder-slate-500"
           />
           {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a202c] border border-slate-700 rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto">
                 {searchResults.map(res => (
                    <div 
                       key={res} 
                       className="p-3 hover:bg-emerald-500/10 cursor-pointer text-sm text-slate-200"
                       onClick={() => handleAddCoin(res)}
                    >
                       {res}
                    </div>
                 ))}
              </div>
           )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
           {currentCoins.map((coin: string) => (
              <div key={coin} className="flex items-center space-x-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-semibold">
                 <span>{coin}</span>
                 <button onClick={() => handleRemoveCoin(coin)} className="hover:text-rose-400 transition ml-1">
                    <X className="w-3.5 h-3.5" />
                 </button>
              </div>
           ))}
           {currentCoins.length === 0 && <span className="text-slate-500 text-xs">Henüz coin seçilmedi. En az 1 adet ekleyin.</span>}
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
               <label className="block text-xs font-semibold text-slate-400 mb-1">Çalışma Modu</label>
               <select 
                  value={parsedConfig?.dry_run !== false ? "true" : "false"}
                  onChange={(e) => handleUpdate("dry_run", e.target.value === "true")}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3"
               >
                  <option value="true">DRY RUN (Güvenli Test - Simülasyon)</option>
                  <option value="false">LIVE (Gerçek Para - Futures)</option>
               </select>
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">Kaldıraç (1x - 125x)</label>
               <input 
                  type="number" min="1" max="125"
                  value={parsedConfig?.leverage || 15}
                  onChange={(e) => handleUpdate("leverage", Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3"
               />
               <p className="text-[10px] text-slate-500 mt-1">Hedef ve Stoplar daima 1x üzerinden hesaplanır. Kaldıraç sadece marjini değiştirir.</p>
            </div>
          </div>

          <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl space-y-4">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span>Risk & Hedef Yönetimi</span>
            </h3>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">Akıllı Kâr Hedefi (1x Bazında)</label>
               <select 
                  value={parsedConfig?.smart_target || 10}
                  onChange={(e) => handleUpdate("smart_target", Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3"
               >
                  <option value="3">%3 Hedef (Hızlı Scalp)</option>
                  <option value="5">%5 Hedef (Kısa Vade)</option>
                  <option value="10">%10 Hedef (Standart)</option>
                  <option value="15">%15 Hedef (Trend Takibi)</option>
               </select>
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">Zarar & Kâr Koruma Profili</label>
               <select 
                  value={parsedConfig?.risk_profile || "balanced"}
                  onChange={(e) => handleUpdate("risk_profile", e.target.value)}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3"
               >
                  <option value="conservative">Muhafazakar (Stop: %0.8, İzleyen: %1.5)</option>
                  <option value="balanced">Dengeli (Stop: %1.5, İzleyen: %3.0)</option>
                  <option value="aggressive">Agresif (Stop: %2.5, İzleyen: %5.0)</option>
               </select>
            </div>
          </div>
      </div>
      
      {/* API KEYS */}
      <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center space-x-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span>Binance API Kimlik Bilgileri</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">API Key</label>
               <input 
                  type="password"
                  value={parsedConfig?.exchange?.key || ""}
                  onChange={(e) => handleUpdate("key", e.target.value, "exchange")}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3"
               />
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">API Secret</label>
               <input 
                  type="password"
                  value={parsedConfig?.exchange?.secret || ""}
                  onChange={(e) => handleUpdate("secret", e.target.value, "exchange")}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3"
               />
            </div>
        </div>
      </div>

    </div>
  );
};
"""

with open("src/components/ConfigEditor.tsx", "w") as f:
    f.write(new_config_code)
