import React, { useState } from 'react';
import { Terminal, Send, CheckCircle2, Copy, Check, ExternalLink } from 'lucide-react';

export const ApiDocumentation: React.FC = () => {
  const [selectedEndpoint, setSelectedEndpoint] = useState('/api/v1/ping');
  const [method, setMethod] = useState('GET');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const endpoints = [
    { path: '/api/v1/ping', method: 'GET', desc: 'Health check endpoint' },
    { path: '/api/v1/ip', method: 'GET', desc: 'Get current Render server public IP address' },
    { path: '/api/v1/status', method: 'GET', desc: 'Get bot running state, server IP & strategy info' },
    { path: '/api/v1/balance', method: 'GET', desc: 'Get current wallet balances (USDT & crypto assets)' },
    { path: '/api/v1/trades', method: 'GET', desc: 'Get active open trades & trade history' },
    { path: '/api/v1/profit', method: 'GET', desc: 'Get cumulative profit/loss & win rate statistics' },
    { path: '/api/v1/pairlists', method: 'GET', desc: 'Get whitelisted & blacklisted trading pairs' },
    { path: '/api/v1/strategies', method: 'GET', desc: 'List available trading strategies' },
    { path: '/api/v1/logs', method: 'GET', desc: 'Get recent system logs' },
    { path: '/api/v1/start', method: 'POST', desc: 'Start or resume the trading bot' },
    { path: '/api/v1/stop', method: 'POST', desc: 'Stop the trading bot' },
  ];

  const handleTestEndpoint = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch(selectedEndpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setResponse(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl">
        <h2 className="text-lg font-bold text-white flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <span>Freqtrade REST API Console & Documentation</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Interactive REST API endpoint explorer allowing programmatic control and telemetry monitoring of Freqtrade.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Endpoint List Sidebar */}
        <div className="bg-[#151921] border border-[#1e232f] p-4 rounded-xl shadow-xl space-y-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 pb-2 border-b border-[#1e232f]">
            API Endpoints
          </h3>
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {endpoints.map((e) => {
              const isSelected = selectedEndpoint === e.path;
              return (
                <div
                  key={e.path}
                  onClick={() => {
                    setSelectedEndpoint(e.path);
                    setMethod(e.method);
                    setResponse(null);
                  }}
                  className={`p-2.5 rounded-lg border cursor-pointer transition ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-md'
                      : 'bg-[#0b0e14] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      e.method === 'GET' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {e.method}
                    </span>
                    <span className="font-mono text-xs text-white font-bold">{e.path}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 truncate">{e.desc}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* API Playground & Response Viewer */}
        <div className="lg:col-span-2 bg-[#151921] border border-[#1e232f] rounded-xl shadow-xl p-5 space-y-4 flex flex-col">
          {/* Request Header */}
          <div className="flex items-center space-x-3 bg-[#0b0e14] p-3 rounded-lg border border-slate-800">
            <span className={`px-2.5 py-1 rounded text-xs font-bold font-mono ${
              method === 'GET' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {method}
            </span>
            <span className="font-mono text-sm text-white font-bold flex-1">{selectedEndpoint}</span>
            <button
              onClick={handleTestEndpoint}
              disabled={loading}
              className="flex items-center space-x-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-1.5 rounded-lg text-xs transition shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Executing...' : 'Send Request'}</span>
            </button>
          </div>

          {/* Response Box */}
          <div className="flex-1 bg-[#0b0e14] border border-slate-800 rounded-lg flex flex-col overflow-hidden min-h-[380px]">
            <div className="p-2.5 bg-[#11141a] border-b border-slate-800 flex justify-between items-center text-xs font-mono text-slate-400">
              <span>Response Payload (JSON)</span>
              {response && (
                <button
                  onClick={copyResponse}
                  className="flex items-center space-x-1 text-slate-400 hover:text-white transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>

            <pre className="p-4 text-emerald-300 font-mono text-xs overflow-auto flex-1 leading-relaxed">
              {response || '// Click "Send Request" to test this API endpoint.'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
