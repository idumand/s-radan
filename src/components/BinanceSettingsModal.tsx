import React, { useState } from 'react';
import { X, Key, ShieldAlert, Globe, Copy, Check } from 'lucide-react';

interface BinanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, secretKey: string) => void;
  serverIp?: string;
}

export const BinanceSettingsModal: React.FC<BinanceSettingsModalProps> = ({ isOpen, onClose, onSave, serverIp = 'Tespit ediliyor...' }) => {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedIp, setCopiedIp] = useState(false);

  if (!isOpen) return null;

  const handleCopyIp = () => {
    if (serverIp && serverIp !== 'Tespit ediliyor...') {
      navigator.clipboard.writeText(serverIp);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(apiKey, secretKey);
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#151921] border border-[#2a3142] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-[#1e232f]">
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-400" />
            Binance API Ayarları
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* IP Whitelist Box */}
          <div className="bg-[#0b0e14] border border-blue-500/30 p-3.5 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-sky-400" />
                Render Sunucu IP Adresiniz
              </span>
              <button
                type="button"
                onClick={handleCopyIp}
                className="flex items-center gap-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-2 py-1 rounded text-xs font-mono border border-blue-500/40 transition"
              >
                {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedIp ? 'Kopyalandı!' : 'IP Kopyala'}
              </button>
            </div>
            <div className="text-sm font-mono font-bold text-white bg-[#151921] px-3 py-1.5 rounded border border-[#2a3142] flex items-center justify-between">
              <span>{serverIp}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Binance'de API Key kısıtlamasında (IP Restriction) bu adresi kullanabilirsiniz. Render IP adresi değişirse uygulama otomatik algılar.
            </p>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300/90 leading-relaxed">
              API anahtarlarınız doğrudan Node.js arka plan motoruna iletilecek ve botun canlı işlem (Live Trading) yapabilmesini sağlayacaktır. Lütfen çekim (withdrawal) yetkisi OLMAYAN bir anahtar kullanın.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#2a3142] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                placeholder="Örn: XyZ123..."
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                Secret Key
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#2a3142] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                placeholder="Örn: AbC987..."
                autoComplete="off"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#1e232f] bg-[#0b0e14]/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey || !secretKey || isSaving}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
          >
            {isSaving ? 'Kaydediliyor...' : 'Bağlan ve Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};
