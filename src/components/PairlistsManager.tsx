import React, { useState } from 'react';
import { MarketPairInfo } from '../types';
import {
  ListFilter,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface PairlistsManagerProps {
  markets: MarketPairInfo[];
  onToggleWhitelist: (symbol: string) => void;
  onToggleBlacklist: (symbol: string) => void;
  onAddPair: (symbol: string) => void;
}

export const PairlistsManager: React.FC<PairlistsManagerProps> = ({
  markets,
  onToggleWhitelist,
  onToggleBlacklist,
  onAddPair,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [activeTab, setActiveTab] = useState<'whitelist' | 'blacklist' | 'all'>('whitelist');

  const filteredMarkets = markets.filter((m) => {
    const matchesSearch = m.symbol.toLowerCase().includes(searchTerm.toLowerCase()) || m.base.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === 'whitelist') return matchesSearch && m.in_whitelist;
    if (activeTab === 'blacklist') return matchesSearch && m.in_blacklist;
    return matchesSearch;
  });

  const handleAddNewPair = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    const formatted = newSymbol.trim().toUpperCase().includes('/') ? newSymbol.trim().toUpperCase() : `${newSymbol.trim().toUpperCase()}/USDT`;
    onAddPair(formatted);
    setNewSymbol('');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <ListFilter className="w-5 h-5 text-emerald-400" />
            <span>Market Pair ve Beyaz/Kara Liste Yönetimi</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure dynamic pairlists, whitelisted trading pairs, and blacklisted crypto assets.
          </p>
        </div>

        {/* Market Pair Ekle Form */}
        <form onSubmit={handleAddNewPair} className="flex items-center space-x-2">
          <input
            type="text"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            placeholder="e.g. LINK/USDT"
            className="bg-[#0b0e14] border border-slate-700 text-white font-mono text-xs rounded-lg px-3 py-2 focus:border-emerald-500 uppercase"
          />
          <button
            type="submit"
            className="flex items-center space-x-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-2 rounded-lg text-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Market Pair Ekle</span>
          </button>
        </form>
      </div>

      {/* Navigation & Search Bar */}
      <div className="bg-[#151921] border border-[#1e232f] p-4 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-2 bg-[#0b0e14] p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('whitelist')}
            className={`px-4 py-1.5 text-xs font-semibold rounded transition ${
              activeTab === 'whitelist' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Whitelist ({markets.filter((m) => m.in_whitelist).length})
          </button>
          <button
            onClick={() => setActiveTab('blacklist')}
            className={`px-4 py-1.5 text-xs font-semibold rounded transition ${
              activeTab === 'blacklist' ? 'bg-rose-500 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Blacklist ({markets.filter((m) => m.in_blacklist).length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-1.5 text-xs font-semibold rounded transition ${
              activeTab === 'all' ? 'bg-indigo-500 text-white font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Markets ({markets.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search crypto pair..."
            className="bg-[#0b0e14] border border-slate-700 text-white font-mono text-xs rounded-lg pl-9 pr-3 py-2 focus:border-emerald-500 w-60"
          />
        </div>
      </div>

      {/* Markets Table */}
      <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-4 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0b0e14] text-slate-400 border-b border-[#1e232f] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Symbol / Asset</th>
                <th className="py-3 px-4">Price (USDT)</th>
                <th className="py-3 px-4">24h Change</th>
                <th className="py-3 px-4">24h Volume</th>
                <th className="py-3 px-4">Bot Signal</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Whitelist / Blacklist Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e232f]">
              {filteredMarkets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                    No crypto pairs found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredMarkets.map((m) => {
                  const isPos = m.change_24h_pct >= 0;
                  return (
                    <tr key={m.symbol} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-bold text-slate-200">{m.symbol}</td>
                      <td className="py-3 px-4 text-slate-200">
                        ${m.price < 1 ? m.price.toFixed(4) : m.price.toLocaleString()}
                      </td>
                      <td className={`py-3 px-4 font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? '+' : ''}{m.change_24h_pct}%
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        ${(m.volume_24h_usdt / 1000000).toFixed(2)}M
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
                          m.signal === 'SELL' ? 'bg-rose-500/20 text-rose-400' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {m.signal}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {m.in_whitelist && (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-sans">
                            Whitelisted
                          </span>
                        )}
                        {m.in_blacklist && (
                          <span className="text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-sans ml-1">
                            Blacklisted
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => onToggleWhitelist(m.symbol)}
                          className={`px-2.5 py-1 rounded text-[11px] font-sans font-semibold transition border ${
                            m.in_whitelist
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          }`}
                        >
                          {m.in_whitelist ? 'Whitelistedn Çıkar' : 'Add Whitelist'}
                        </button>
                        <button
                          onClick={() => onToggleBlacklist(m.symbol)}
                          className={`px-2.5 py-1 rounded text-[11px] font-sans font-semibold transition border ${
                            m.in_blacklist
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                          }`}
                        >
                          {m.in_blacklist ? 'Blacklistedn Çıkar' : 'Blacklist'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
