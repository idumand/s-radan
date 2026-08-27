import re

with open("src/components/OrderBookVisualizer.tsx", "r") as f:
    text = f.read()

# Insert deep score logic
pattern_vars = r"const \{ OBI, MicroPrice, MidPrice, deltaV, currentPrice, VWAP, stdDev, SpreadPct \} = metrics;"
replacement_vars = r"""const { OBI, MicroPrice, MidPrice, deltaV, currentPrice, VWAP, stdDev, SpreadPct, deepScore, atr } = metrics;"""
text = re.sub(pattern_vars, replacement_vars, text)

pattern_grid = r"(<div className=\"grid grid-cols-2 gap-4 mt-6 border-t border-\[\#1e232f\] pt-6\">)"
replacement_grid = r"""
<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 border-t border-[#1e232f] pt-6 mb-4">
  <div className="bg-[#11141a] p-3 rounded-lg border border-[#1e232f]">
    <div className="text-xs text-slate-500 mb-1">Deep Score (Yön)</div>
    <div className={`font-mono text-lg font-bold ${deepScore > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{deepScore?.toFixed(0) || 0}</div>
  </div>
  <div className="bg-[#11141a] p-3 rounded-lg border border-[#1e232f]">
    <div className="text-xs text-slate-500 mb-1">Volatilite (ATR)</div>
    <div className="font-mono text-lg font-bold text-blue-400">{atr?.toFixed(2) || 0}</div>
  </div>
  <div className="bg-[#11141a] p-3 rounded-lg border border-[#1e232f]">
    <div className="text-xs text-slate-500 mb-1">Güven</div>
    <div className="font-mono text-lg font-bold text-amber-400">{Math.min(100, Math.abs((deepScore||0) * 1.5)).toFixed(0)}%</div>
  </div>
  <div className="bg-[#11141a] p-3 rounded-lg border border-[#1e232f]">
    <div className="text-xs text-slate-500 mb-1">OBI (Proxy)</div>
    <div className="font-mono text-lg font-bold text-purple-400">{((deepScore||0)/100).toFixed(2)}</div>
  </div>
</div>
\1"""
text = re.sub(pattern_grid, replacement_grid, text)

with open("src/components/OrderBookVisualizer.tsx", "w") as f:
    f.write(text)

