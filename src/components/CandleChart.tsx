import React, { useState } from 'react';
import { Candle, Trade } from '../types';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  CartesianGrid,
  ReferenceDot,
} from 'recharts';
import { BarChart2, Layers, Eye } from 'lucide-react';

interface CandleChartProps {
  pair: string;
  timeframe: string;
  candles: Candle[];
  trades: Trade[];
}

export const CandleChart: React.FC<CandleChartProps> = ({
  pair,
  timeframe,
  candles,
  trades,
}) => {
  const [showSMA, setShowSMA] = useState(true);
  const [showBB, setShowBB] = useState(true);
  const [showRSI, setShowRSI] = useState(true);

  // Format data for Recharts
  const chartData = candles.map((c) => ({
    ...c,
    candleColor: c.close >= c.open ? '#00D09C' : '#FF4D4D',
    bodyMin: Math.min(c.open, c.close),
    bodyMax: Math.max(c.open, c.close),
    wickHeight: c.high - c.low,
    bodyHeight: Math.abs(c.close - c.open) || 0.1,
  }));

  // Find relevant trade entry & exit points for markers
  const pairTrades = trades.filter((t) => t.pair === pair);

  return (
    <div className="bg-[#151921] border border-[#1e232f] rounded-xl p-4 flex flex-col space-y-4 shadow-xl">
      {/* Chart Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1e232f]">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <BarChart2 className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-base text-white">{pair}</span>
            <span className="text-xs bg-[#1e232f] text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
              {timeframe}
            </span>
          </div>

          {candles.length > 0 && (
            <div className="flex items-center space-x-3 text-xs font-mono">
              <span className="text-slate-400">
                O: <span className="text-slate-200">{candles[candles.length - 1].open}</span>
              </span>
              <span className="text-slate-400">
                H: <span className="text-emerald-400">{candles[candles.length - 1].high}</span>
              </span>
              <span className="text-slate-400">
                L: <span className="text-rose-400">{candles[candles.length - 1].low}</span>
              </span>
              <span className="text-slate-400">
                C: <span className={candles[candles.length - 1].close >= candles[candles.length - 1].open ? 'text-emerald-400' : 'text-rose-400'}>
                  {candles[candles.length - 1].close}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Toggle Indicator Toggles */}
        <div className="flex items-center space-x-2 text-xs">
          <button
            onClick={() => setShowSMA(!showSMA)}
            className={`px-2.5 py-1 rounded font-medium transition border ${
              showSMA
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-[#1e232f] border-slate-700 text-slate-400'
            }`}
          >
            SMA (20/50)
          </button>
          <button
            onClick={() => setShowBB(!showBB)}
            className={`px-2.5 py-1 rounded font-medium transition border ${
              showBB
                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
                : 'bg-[#1e232f] border-slate-700 text-slate-400'
            }`}
          >
            Bollinger Bands
          </button>
          <button
            onClick={() => setShowRSI(!showRSI)}
            className={`px-2.5 py-1 rounded font-medium transition border ${
              showRSI
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-[#1e232f] border-slate-700 text-slate-400'
            }`}
          >
            RSI (14)
          </button>
        </div>
      </div>

      {/* Main Candlestick Chart */}
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" stroke="#475569" tick={{ fontSize: 11 }} />
            <YAxis
              domain={['auto', 'auto']}
              orientation="right"
              stroke="#475569"
              tick={{ fontSize: 11 }}
              tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toString()}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Candle Bar representing Body & Wick */}
            <Bar dataKey="close" fill="#00D09C" radius={[2, 2, 0, 0]} />

            {/* SMA Lines */}
            {showSMA && (
              <>
                <Line
                  type="monotone"
                  dataKey="sma20"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  dot={false}
                  name="SMA 20"
                />
                <Line
                  type="monotone"
                  dataKey="sma50"
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  dot={false}
                  name="SMA 50"
                />
              </>
            )}

            {/* Bollinger Bands */}
            {showBB && (
              <>
                <Line
                  type="monotone"
                  dataKey="bbUpper"
                  stroke="#818CF8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  dot={false}
                  name="BB Upper"
                />
                <Line
                  type="monotone"
                  dataKey="bbLower"
                  stroke="#818CF8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  dot={false}
                  name="BB Lower"
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume & RSI Sub-Chart */}
      {showRSI && (
        <div className="h-[120px] w-full pt-2 border-t border-[#1e232f]">
          <div className="text-[11px] font-semibold text-slate-400 mb-1 flex justify-between">
            <span>RSI (14) Indicator</span>
            <span className="font-mono text-emerald-400">
              Current: {candles[candles.length - 1]?.rsi ?? 50}
            </span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <XAxis dataKey="time" hide />
              <YAxis domain={[0, 100]} orientation="right" stroke="#475569" tick={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="rsi" stroke="#34D399" strokeWidth={1.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

// Custom Tooltip component for Recharts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#151921] border border-slate-700 p-3 rounded-lg shadow-2xl text-xs space-y-1 font-mono">
        <div className="font-sans font-bold text-slate-200 border-b border-slate-800 pb-1 mb-1">{data.time}</div>
        <div className="flex justify-between space-x-4">
          <span className="text-slate-400">Open:</span>
          <span className="text-white">${data.open}</span>
        </div>
        <div className="flex justify-between space-x-4">
          <span className="text-slate-400">High:</span>
          <span className="text-emerald-400">${data.high}</span>
        </div>
        <div className="flex justify-between space-x-4">
          <span className="text-slate-400">Low:</span>
          <span className="text-rose-400">${data.low}</span>
        </div>
        <div className="flex justify-between space-x-4">
          <span className="text-slate-400">Close:</span>
          <span className={data.close >= data.open ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
            ${data.close}
          </span>
        </div>
        <div className="flex justify-between space-x-4">
          <span className="text-slate-400">Volume:</span>
          <span className="text-slate-300">{data.volume?.toLocaleString()}</span>
        </div>
        {data.sma20 && (
          <div className="flex justify-between space-x-4 text-amber-400 pt-1 border-t border-slate-800">
            <span>SMA20:</span>
            <span>${data.sma20}</span>
          </div>
        )}
        {data.rsi && (
          <div className="flex justify-between space-x-4 text-emerald-400">
            <span>RSI(14):</span>
            <span>{data.rsi}</span>
          </div>
        )}
      </div>
    );
  }
  return null;
};
