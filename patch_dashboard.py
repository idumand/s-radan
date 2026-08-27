import re
with open("src/components/TradingDashboard.tsx", "r") as f:
    text = f.read()

# Replace the open trades map to include these new metrics.
# Let's search for the "Açık İşlem Bulunmuyor" block and add the new info
# Wait, it's easier to just append it to the table row in TradingDashboard.tsx

pattern = r"(<td className=\"px-6 py-4 whitespace-nowrap text-sm text-slate-300\">\s*\{t\.pair\}\s*</td>)"
replacement = r"""\1
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-400">
                           <div>Derinlik Puanı: <span className={t.deep_score && t.deep_score > 0 ? "text-emerald-400" : "text-rose-400"}>{t.deep_score?.toFixed(0) || 0}</span></div>
                           <div>Hedef: %{t.target_pct || 10} ({t.risk_profile || 'balanced'})</div>
                        </td>"""
text = re.sub(pattern, replacement, text)

# Add header
pattern2 = r"(<th className=\"px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider\">\s*Parite\s*</th>)"
replacement2 = r"""\1
                      <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Analiz & Hedef
                      </th>"""
text = re.sub(pattern2, replacement2, text)

with open("src/components/TradingDashboard.tsx", "w") as f:
    f.write(text)
