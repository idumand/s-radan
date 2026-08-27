import React, { useState } from 'react';
import { BotMetrics, Trade, Candle, MarketPairInfo, LogEntry, Timeframe } from '../types';
import { CandleChart } from './CandleChart';
import { OrderBookVisualizer } from './OrderBookVisualizer';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Award,
  Activity,
  AlertTriangle,
  XCircle,
  Clock,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  ListFilter
} from 'lucide-react';

interface TradingDashboardProps {
  metrics: BotMetrics;
  trades: Trade[];
  markets: MarketPairInfo[];
  candles: Candle[];
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  timeframe: Timeframe;
  setTimeframe: (tf: Timeframe) => void;
  onForceCloseTrade: (tradeId: string) => void;
  logs: LogEntry[];
}

export const TradingDashboard: React.FC<TradingDashboardProps> = ({
  metrics,
  trades,
  markets,
  candles,
  selectedPair,
  setSelectedPair,
  timeframe,
  setTimeframe,
  onForceCloseTrade,
  logs,
}) => {
  const [tradeFilter, setTradeFilter] = useState<'open' | 'closed' | 'all'>('open');

  const openTrades = trades.filter((t) => t.is_open);
  const closedTrades = trades.filter((t) => !t.is_open);
  const displayedTrades = tradeFilter === 'open' ? openTrades : tradeFilter === 'closed' ? closedTrades : trades;

  const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

  return (
    <div className="space-y-6">
      {/* KPI Performance Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Profit/Loss Card */}
        <div className="bg-[#151921] border border-[#1e232f] p-3 sm:p-4 rounded-xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Toplam Kâr/Zarar</span>
            <div className={`p-1.5 sm:p-2 rounded-lg ${metrics.total_pnl_usdt >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {metrics.total_pnl_usdt >= 0 ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1 sm:space-x-2 truncate">
            <span className="text-lg sm:text-xl font-mono font-bold text-white">
              {metrics.total_pnl_usdt >= 0 ? '+' : ''}${metrics.total_pnl_usdt.toFixed(2)}
            </span>
            <span className={`text-[10px] sm:text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
              metrics.total_pnl_pct >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
            }`}>
              {metrics.total_pnl_pct >= 0 ? '+' : ''}{metrics.total_pnl_pct.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-slate-400 truncate">
            Günlük: <span className={metrics.daily_pnl_usdt >= 0 ? 'text-emerald-400 font-mono font-semibold' : 'text-rose-400 font-mono font-semibold'}>
              {metrics.daily_pnl_usdt >= 0 ? '+' : ''}${metrics.daily_pnl_usdt.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Win Rate & Trades Count */}
        <div className="bg-[#151921] border border-[#1e232f] p-3 sm:p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Kazanma Oranı</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Award className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1 sm:space-x-2">
            <span className="text-lg sm:text-xl font-mono font-bold text-white">{metrics.win_rate}%</span>
            <span className="text-[10px] sm:text-xs text-slate-400 truncate">({metrics.winning_trades}W/{metrics.losing_trades}L)</span>
          </div>
          <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-slate-400 truncate">
            İşlem: <span className="text-slate-200 font-mono">{metrics.total_trades}</span>
          </div>
        </div>

        {/* Active Open Positions */}
        <div className="bg-[#151921] border border-[#1e232f] p-3 sm:p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Açık Pozisyonlar</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1 sm:space-x-2">
            <span className="text-lg sm:text-xl font-mono font-bold text-white">{openTrades.length}</span>
            <span className="text-[10px] sm:text-xs text-slate-400">/ {metrics.max_open_trades}</span>
          </div>
          <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-slate-400 truncate">
            Tutar: <span className="text-slate-200 font-mono">${metrics.stake_amount}</span>
          </div>
        </div>

        {/* Risk & Sharpe Ratio */}
        <div className="bg-[#151921] border border-[#1e232f] p-3 sm:p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Metrikleri</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline space-x-1 sm:space-x-2">
            <span className="text-lg sm:text-xl font-mono font-bold text-white">{metrics.sharpe_ratio}</span>
            <span className="text-[10px] sm:text-xs text-slate-400">Sharpe</span>
          </div>
          <div className="mt-1 sm:mt-2 text-[10px] sm:text-xs text-slate-400 truncate">
            Düşüş: <span className="text-rose-400 font-mono font-semibold">-{metrics.max_drawdown_pct}%</span>
          </div>
        </div>
      </div>

      {/* Active Position Tabs/Pills */}
      {openTrades.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 pb-2">
          {openTrades.map((trade) => (
            <button
              key={trade.id}
              onClick={() => setSelectedPair(trade.pair)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold transition-all ${
                selectedPair === trade.pair 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50 border border-indigo-500' 
                  : 'bg-[#151921] text-slate-400 hover:bg-[#1e232f] border border-[#1e232f]'
              }`}
            >
              <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${trade.type === 'long' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span>{trade.pair}</span>
              <span className={`font-mono ${trade.profit_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {trade.profit_pct >= 0 ? '+' : ''}{trade.profit_pct.toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Main Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column: Candlestick Chart */}
        <div className="lg:col-span-3 space-y-4">
          {/* Pair & Timeframe Bar */}
          <div className="bg-[#151921] border border-[#1e232f] p-3 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400">Parite:</span>
              <select
                id="pair-select"
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
                className="bg-[#0b0e14] border border-slate-700 text-white font-mono font-bold text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
              >
                {markets.map((m) => (
                  <option key={m.symbol} value={m.symbol}>
                    {m.symbol} (${m.price.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Timeframe Selector Buttons */}
            <div className="flex items-center space-x-1 bg-[#0b0e14] p-1 rounded-lg border border-slate-800">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  id={`tf-${tf}`}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2.5 py-1 text-xs font-mono font-semibold rounded transition ${
                    timeframe === tf
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Automated Bot Only Indicator */}
            <div className="flex items-center space-x-1.5 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-300">
              <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Otomatik Bot Ticareti Aktif (Sadece Algoritma Pozisyon Açar)</span>
            </div>
          </div>

          <CandleChart
            pair={selectedPair}
            timeframe={timeframe}
            candles={candles}
            trades={trades}
          />
          <OrderBookVisualizer pair={selectedPair} />
        </div>

        {/* Right Column: Whitelist Watchlist Sidebar */}
        <div className="bg-[#151921] border border-[#1e232f] p-4 rounded-xl space-y-4 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-[#1e232f]">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <ListFilter className="w-4 h-4 text-emerald-400" />
              <span>Piyasa İzleme Listesi</span>
            </h3>
            <span className="text-xs text-slate-400 font-mono">{markets.length} parite</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[480px]">
            {markets.map((m) => {
              const isSelected = m.symbol === selectedPair;
              const isPositive = m.change_24h_pct >= 0;
              return (
                <div
                  key={m.symbol}
                  onClick={() => setSelectedPair(m.symbol)}
                  className={`p-3 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-md'
                      : 'bg-[#0b0e14] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs font-mono text-white flex items-center space-x-1.5">
                      <span>{m.symbol}</span>
                      {m.signal === 'BUY' && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded font-sans">
                          BUY
                        </span>
                      )}
                      {m.signal === 'SELL' && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.2 rounded font-sans">
                          SELL
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      ${m.price < 1 ? m.price.toFixed(4) : m.price.toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-xs font-mono font-bold flex items-center justify-end ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}>
                      {isPositive ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                      {isPositive ? '+' : ''}{m.change_24h_pct}%
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Hacim: ${(m.volume_24h_usdt / 1000000).toFixed(1)}M
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Trades Table Section */}
      <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-4 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1e232f]">
          <div className="flex items-center space-x-3">
            <h3 className="font-bold text-base text-white">Bot İşlemleri</h3>
            <div className="flex items-center space-x-1 bg-[#0b0e14] p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setTradeFilter('open')}
                className={`px-3 py-1 text-xs font-semibold rounded transition ${
                  tradeFilter === 'open' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Açık ({openTrades.length})
              </button>
              <button
                onClick={() => setTradeFilter('closed')}
                className={`px-3 py-1 text-xs font-semibold rounded transition ${
                  tradeFilter === 'closed' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Kapalı ({closedTrades.length})
              </button>
              <button
                onClick={() => setTradeFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded transition ${
                  tradeFilter === 'all' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Tümü ({trades.length})
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#0b0e14] text-slate-400 border-b border-[#1e232f] uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">İşlem ID / Parite</th>
                <th className="py-3 px-4">Tür</th>
                <th className="py-3 px-4">Açılış Tarihi</th>
                <th className="py-3 px-4">Giriş Fiyatı</th>
                <th className="py-3 px-4">Mevcut / Kapanış</th>
                <th className="py-3 px-4">Zarar Kes / Kâr Al</th>
                <th className="py-3 px-4">Kâr % (USDT)</th>
                <th className="py-3 px-4 text-right">İşlem / Çıkış Nedeni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e232f]">
              {displayedTrades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-sans">
                    Seçilen filtreye uygun işlem bulunamadı.
                  </td>
                </tr>
              ) : (
                displayedTrades.map((t) => {
                  const isPositive = t.profit_pct >= 0;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-200">{t.pair}</div>
                        <div className="text-[10px] text-slate-500">{t.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          t.type === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {t.type} {t.leverage > 1 ? `${t.leverage}x` : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">{t.open_date}</td>
                      <td className="py-3 px-4 text-slate-300">${t.open_rate.toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-300">
                        ${(t.close_rate || t.current_rate).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        <div className="text-rose-400">SL: ${t.stop_loss_abs.toLocaleString()} ({t.stop_loss_pct}%)</div>
                        {t.take_profit_pct && (
                          <div className="text-emerald-400">TP: +{t.take_profit_pct}%</div>
                        )}
                        {t.model_target_profit_usd !== undefined && t.model_target_profit_usd > 0 && (
                          <div className="text-cyan-300">Model Hedef: +${t.model_target_profit_usd.toFixed(2)}</div>
                        )}
                        {t.model_target_price !== undefined && t.model_target_price > 0 && (
                          <div className="text-cyan-400/80">Hedef Fiyat: ${t.model_target_price.toLocaleString()}</div>
                        )}
                        {t.model_target_confidence !== undefined && t.model_target_confidence > 0 && (
                          <div className="text-slate-500">Erişilebilirlik: %{t.model_target_confidence.toFixed(0)}{t.model_target_accuracy_sample ? ` · ${t.model_target_accuracy_sample} işlem` : ''}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPositive ? '+' : ''}{t.profit_pct.toFixed(2)}%
                        </div>
                        <div className={`text-[11px] ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {isPositive ? '+' : ''}${t.profit_abs.toFixed(2)} USDT
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {t.is_open ? (
                          <button
                            onClick={() => onForceCloseTrade(t.id)}
                            className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded text-[11px] font-sans font-semibold transition"
                          >
                            Zorla Kapat
                          </button>
                        ) : (
                          <span className="text-slate-400 bg-slate-800/80 px-2 py-1 rounded text-[11px] capitalize font-sans">
                            {t.close_reason?.replace('_', ' ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Activity Ticker */}
      <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-4 shadow-xl">
        <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#1e232f]">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400 flex items-center space-x-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>Son Bot Aktiviteleri</span>
          </h3>
          <span className="text-[11px] text-emerald-400 font-mono">Canlı Senkronizasyon</span>
        </div>
        <div className="space-y-1.5 font-mono text-xs max-h-36 overflow-y-auto">
          {logs.slice(0, 5).map((log) => (
            <div key={log.id} className="flex items-center space-x-3 py-1 px-2 rounded bg-[#0b0e14] border border-slate-800/60">
              <span className="text-slate-500 text-[11px]">{log.timestamp}</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                log.level === 'TRADE' ? 'bg-emerald-500/20 text-emerald-400' :
                log.level === 'WARN' ? 'bg-amber-500/20 text-amber-300' :
                log.level === 'ERROR' ? 'bg-rose-500/20 text-rose-400' :
                'bg-slate-800 text-slate-300'
              }`}>
                {log.level}
              </span>
              <span className="text-slate-200 truncate">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
