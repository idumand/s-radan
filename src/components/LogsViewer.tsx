import React, { useState } from 'react';
import { LogEntry } from '../types';
import { Terminal, Search, Trash2, Download, Filter } from 'lucide-react';

interface LogsViewerProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LogsViewer: React.FC<LogsViewerProps> = ({ logs, onClearLogs }) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = filterLevel === 'ALL' || log.level === filterLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const exportLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freqtrade_logs_${Date.now()}.log`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <span>Freqtrade System Terminal & Event Logs</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Strategy sinyalleri, emir yürütme, bot durumu ve borsa API yanıtlarının gerçek zamanlı yayın akışı.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={exportLogs}
            className="flex items-center space-x-1.5 bg-[#0b0e14] hover:bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Logs</span>
          </button>
          <button
            onClick={onClearLogs}
            className="flex items-center space-x-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 px-3 py-1.5 rounded-lg text-xs transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Logs</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-[#151921] border border-[#1e232f] p-4 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        {/* Severity Tabs */}
        <div className="flex items-center space-x-1 bg-[#0b0e14] p-1 rounded-lg border border-slate-800">
          {['ALL', 'INFO', 'TRADE', 'WARNING', 'ERROR'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-3 py-1 text-xs font-mono font-semibold rounded transition ${
                filterLevel === lvl
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search log messages..."
            className="bg-[#0b0e14] border border-slate-700 text-white font-mono text-xs rounded-lg pl-9 pr-3 py-2 focus:border-emerald-500 w-64"
          />
        </div>
      </div>

      {/* Terminal Display Box */}
      <div className="bg-[#0b0e14] border border-slate-800 rounded-xl p-4 shadow-2xl h-[520px] overflow-y-auto font-mono text-xs space-y-1.5 leading-relaxed">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 text-center py-20">No log entries found.</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start space-x-3 hover:bg-slate-900/50 p-1 rounded">
              <span className="text-slate-500 select-none">{log.timestamp}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold select-none ${
                log.level === 'TRADE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                log.level === 'WARN' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                log.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                'bg-slate-800 text-slate-300'
              }`}>
                {log.level}
              </span>
              <span className="text-slate-200 flex-1">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
