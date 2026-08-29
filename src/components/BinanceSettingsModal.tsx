import React, { useState, useEffect } from 'react';
import { X, Key, ShieldAlert, Globe, Copy, Check, Eye, EyeOff, CheckCircle, AlertCircle, ExternalLink, Loader2, Sparkles } from 'lucide-react';

interface BinanceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, secretKey: string, environment: 'testnet' | 'live') => Promise<{ success: boolean; balance_usdt?: number; message?: string }>;
  initialApiKey?: string;
  initialSecretKey?: string;
  initialEnvironment?: 'testnet' | 'live';
  serverIp?: string;
}

export const BinanceSettingsModal: React.FC<BinanceSettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialApiKey = '',
  initialSecretKey = '',
  initialEnvironment = 'testnet',
  serverIp = 'Tespit ediliyor...',
}) => {
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [secretKey, setSecretKey] = useState(initialSecretKey);
  const [environment, setEnvironment] = useState<'testnet' | 'live'>(initialEnvironment);
  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; balance?: number } | null>(null);
  const [copiedIp, setCopiedIp] = useState(false);

  useEffect(() => {
    setApiKey(initialApiKey);
    setSecretKey(initialSecretKey);
    setEnvironment(initialEnvironment);
    setTestResult(null);
  }, [initialApiKey, initialSecretKey, initialEnvironment, isOpen]);

  if (!isOpen) return null;

  const handleCopyIp = () => {
    if (serverIp && serverIp !== 'Tespit ediliyor...' && serverIp !== 'Bağlantı Hatası') {
      navigator.clipboard.writeText(serverIp);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
    }
  };

  const handleTestConnection = async () => {
    const cleanKey = apiKey.trim();
    const cleanSecret = secretKey.trim();
    if (!cleanKey || !cleanSecret) {
      setTestResult({
        success: false,
        message: 'Lütfen hem API Key hem de Secret Key alanlarını doldurun.',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/v1/exchange-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: cleanKey,
          secretKey: cleanSecret,
          environment,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const bal = typeof data.balance_usdt === 'number' ? data.balance_usdt : 0;
        setTestResult({
          success: true,
          message: `Bağlantı Başarılı! Vadeli Cüzdan Bakiyeniz: $${bal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`,
          balance: bal,
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || 'Binance API anahtarları doğrulanamadı.',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: 'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    const cleanKey = apiKey.trim();
    const cleanSecret = secretKey.trim();
    setIsSaving(true);
    try {
      const res = await onSave(cleanKey, cleanSecret, environment);
      if (res && res.success) {
        onClose();
      } else if (res && !res.success) {
        setTestResult({
          success: false,
          message: res.message || 'Kayıt sırasında bağlantı doğrulanamadı.',
        });
      } else {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-[#151921] border border-[#2a3142] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#1e232f]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                Binance Vadeli İşlemler (Futures) Cüzdanı
              </h3>
              <p className="text-xs text-slate-400">API Anahtarları ve Ortam Yapılandırması</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Environment Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Çalışma Ortamı (Testnet / Canlı)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEnvironment('testnet');
                  setTestResult(null);
                }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  environment === 'testnet'
                    ? 'bg-amber-500/10 border-amber-500 text-white shadow-sm'
                    : 'bg-[#0b0e14] border-[#2a3142] text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <span className={`w-2 h-2 rounded-full ${environment === 'testnet' ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                  DEMO/TEST (Sanal Para)
                </div>
                <span className="text-[11px] text-slate-400 mt-1">
                  Risksiz sanal bakiye ile canlı emir testi
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEnvironment('live');
                  setTestResult(null);
                }}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                  environment === 'live'
                    ? 'bg-emerald-500/10 border-emerald-500 text-white shadow-sm'
                    : 'bg-[#0b0e14] border-[#2a3142] text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <span className={`w-2 h-2 rounded-full ${environment === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  CANLI (Gerçek Para)
                </div>
                <span className="text-[11px] text-slate-400 mt-1">
                  Gerçek Binance Futures hesabı
                </span>
              </button>
            </div>
          </div>

          {/* Testnet Instructions Guide */}
          {environment === 'testnet' ? (
            <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-lg space-y-2 text-xs">
              <div className="flex items-center justify-between font-semibold text-amber-300">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Binance Futures Demo/Test API Nasıl Alınır?
                </span>
                <a
                  href="https://demo.binance.com"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
                >
                  Binance Demo'ya Git <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                <li><a href="https://demo.binance.com" target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">demo.binance.com</a> üzerinden Futures Demo hesabınıza girin ve bu ortama ait API anahtarlarını oluşturun.</li>
                <li>Ekranın altındaki <strong>API Key</strong> sekmesine tıklayarak anahtar oluşturun.</li>
                <li>Oluşan <strong>API Key</strong> ve <strong>Secret Key</strong>'i aşağıdaki kutulara yapıştırın.</li>
                <li>Ücretsiz test bakiyesi almak için sayfadaki Faucet / Test Bakiyesi butonuna tıklayın.</li>
              </ol>
            </div>
          ) : (
            <div className="bg-[#0b0e14] border border-blue-500/30 p-3.5 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-sky-400" />
                  Sunucu IP Adresiniz (IP Whitelist)
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
                Binance Canlı API yönetiminde "Vadeli İşlemleri Etkinleştir" (Enable Futures) iznini açtığınızdan ve IP kısıtlamasına bu adresi eklediğinizden emin olun.
              </p>
            </div>
          )}

          {/* Key Inputs */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {environment === 'testnet' ? 'Binance Testnet API Key' : 'Binance Canlı API Key'}
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#2a3142] rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                placeholder={environment === 'testnet' ? 'Testnet API Key yapıştırın...' : 'Canlı API Key yapıştırın...'}
                autoComplete="off"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  {environment === 'testnet' ? 'Binance Demo/Test Secret Key' : 'Binance Canlı Secret Key'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showSecret ? 'Gizle' : 'Göster'}
                </button>
              </div>
              <input
                type={showSecret ? 'text' : 'password'}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="w-full bg-[#0b0e14] border border-[#2a3142] rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                placeholder={environment === 'testnet' ? 'Demo/Test Secret Key yapıştırın...' : 'Canlı Secret Key yapıştırın...'}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Test Connection Button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!apiKey.trim() || !secretKey.trim() || isTesting}
              className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold bg-[#1e232f] hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 border border-slate-700 transition flex items-center justify-center gap-2"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Binance {environment === 'testnet' ? 'Testnet' : 'Canlı'} Bağlantısı Kontrol Ediliyor...</span>
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Bağlantıyı Test Et ve Bakiyeyi Gör</span>
                </>
              )}
            </button>
          </div>

          {/* Test Result Message Box */}
          {testResult && (
            <div
              className={`p-3.5 rounded-lg border text-xs leading-relaxed ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="whitespace-pre-line">{testResult.message}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#1e232f] bg-[#0b0e14]/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Vazgeç
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <span>Cüzdanı Bağla ve Kaydet</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

