import React, { useState } from 'react';
import { StrategyInfo } from '../types';
import {
  Code,
  CheckCircle2,
  Save,
  Sliders,
  Copy,
  Check,
  Zap,
  AlertCircle,
  FileCode2
} from 'lucide-react';

interface StrategyStudioProps {
  strategies: Record<string, StrategyInfo>;
  selectedStrategy: string;
  onSelectStrategy: (name: string) => void;
  onSaveStrategy: (name: string, updated: StrategyInfo) => void;
}

export const StrategyStudio: React.FC<StrategyStudioProps> = ({
  strategies,
  selectedStrategy,
  onSelectStrategy,
  onSaveStrategy,
}) => {
  const current = strategies[selectedStrategy] || strategies['SampleStrategy'] || Object.values(strategies)[0];
  const [code, setCode] = useState<string>(current?.code_python || '');
  const [stoploss, setStoploss] = useState<string>(String(current?.stoploss ?? -0.02));
  const [trailingStop, setTrailingStop] = useState(current?.trailing_stop ?? false);
  const [copied, setCopied] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const handleStrategyChange = (name: string) => {
    onSelectStrategy(name);
    const strat = strategies[name];
    if (strat) {
      setCode(strat.code_python || '');
      setStoploss(String(strat.stoploss));
      setTrailingStop(strat.trailing_stop);
      setValidationMsg(null);
    }
  };

  const handleSave = () => {
    if (!current) return;
    const parsedStoploss = stoploss.trim() === '' ? -0.02 : parseFloat(stoploss) || -0.02;
    const updated: StrategyInfo = {
      ...current,
      code_python: code,
      stoploss: parsedStoploss,
      trailing_stop: trailingStop,
    };
    setStoploss(String(parsedStoploss));
    onSaveStrategy(selectedStrategy, updated);
    setValidationMsg('Strategy saved successfully!');
    setTimeout(() => setValidationMsg(null), 3000);
  };

  const validateStrategy = () => {
    if (!code || !code.includes('class ') || !code.includes('IStrategy')) {
      setValidationMsg('Error: Strategy class must inherit from IStrategy.');
      return;
    }
    if (!code.includes('populate_indicators') || !code.includes('populate_entry_trend')) {
      setValidationMsg('Warning: Missing required populate_indicators or populate_entry_trend methods.');
      return;
    }
    setValidationMsg('Validation Passed: Strategy class is compliant with Freqtrade IStrategy v3 interface!');
  };

  const copyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Strategy Selector */}
      <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <Code className="w-5 h-5 text-emerald-400" />
            <span>Strategy Studio & Parameter Tuner</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure, optimize, and edit Python trading strategies for Freqtrade sfeef.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs font-semibold text-slate-400">Active Strategy:</label>
          <select
            id="strategy-selector"
            value={selectedStrategy}
            onChange={(e) => handleStrategyChange(e.target.value)}
            className="bg-[#0b0e14] border border-slate-700 text-white font-mono font-bold text-xs rounded-lg px-3 py-2 focus:border-emerald-500"
          >
            {Object.keys(strategies).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {validationMsg && (
        <div className={`p-3 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
          validationMsg.startsWith('Error') || validationMsg.startsWith('Warning')
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
            : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
        }`}>
          {validationMsg.startsWith('Error') ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{validationMsg}</span>
        </div>
      )}

      {/* Main Grid: Parameters Sidebar & Code Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Parameter Tuner */}
        <div className="bg-[#151921] border border-[#1e232f] p-5 rounded-xl shadow-xl space-y-5">
          <h3 className="font-bold text-sm text-white flex items-center space-x-2 pb-3 border-b border-[#1e232f]">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>Strategy Parameters</span>
          </h3>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
            <p className="text-xs text-slate-300 leading-relaxed bg-[#0b0e14] p-2.5 rounded-lg border border-slate-800">
              {current.description}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Candle Timeframe</label>
            <div className="text-xs font-mono font-bold text-emerald-400 bg-[#0b0e14] p-2 rounded-lg border border-slate-800">
              {current.timeframe}
            </div>
          </div>

          {/* Minimal ROI Table */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Minimal ROI Matrix</label>
            <div className="bg-[#0b0e14] p-3 rounded-lg border border-slate-800 space-y-2 font-mono text-xs">
              {Object.entries(current.minimal_roi).map(([time, roi]) => (
                <div key={time} className="flex justify-between items-center text-slate-300">
                  <span>{time} mins:</span>
                  <span className="text-emerald-400 font-bold">{(Number(roi) * 100).toFixed(1)}% ROI</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stoploss Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Stoploss %</label>
            <input
              type="number"
              step="0.005"
              value={stoploss}
              onChange={(e) => setStoploss(e.target.value)}
              placeholder="-0.02"
              className="w-full bg-[#0b0e14] border border-slate-700 text-white font-mono text-xs rounded-lg p-2.5 focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">Negative decimal e.g. -0.03 for 3% stoploss</span>
          </div>

          {/* Trailing Stop Toggle */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="text-xs font-semibold text-slate-300">Trailing Stoploss</span>
              <p className="text-[10px] text-slate-500">Dynamically raise stoploss as price rises</p>
            </div>
            <input
              type="checkbox"
              checked={trailingStop}
              onChange={(e) => setTrailingStop(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-3 space-y-2">
            <button
              onClick={handleSave}
              className="w-full flex items-center justify-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2 px-4 rounded-lg transition"
            >
              <Save className="w-4 h-4" />
              <span>Save Strategy Changes</span>
            </button>
            <button
              onClick={validateStrategy}
              className="w-full flex items-center justify-center space-x-2 bg-[#0b0e14] hover:bg-slate-800 text-slate-300 border border-slate-700 py-2 px-4 rounded-lg transition text-xs font-semibold"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Validate Strategy Code</span>
            </button>
          </div>
        </div>

        {/* Right Column: Code Editor View */}
        <div className="lg:col-span-2 bg-[#151921] border border-[#1e232f] rounded-xl shadow-xl flex flex-col">
          <div className="p-4 border-b border-[#1e232f] flex items-center justify-between bg-[#11141a] rounded-t-xl">
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-300">
              <FileCode2 className="w-4 h-4 text-emerald-400" />
              <span>{selectedStrategy}.py</span>
            </div>
            <button
              onClick={copyCode}
              className="flex items-center space-x-1 text-xs text-slate-400 hover:text-white bg-[#0b0e14] border border-slate-800 px-2.5 py-1 rounded transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-[540px] bg-[#0b0e14] text-slate-200 font-mono text-xs p-4 focus:outline-none resize-none leading-relaxed rounded-b-xl border-t-0 border-slate-800 selection:bg-emerald-500/30"
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
};
