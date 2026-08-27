import re

with open("src/components/ConfigEditor.tsx", "r") as f:
    text = f.read()

# Add a field for İşlem Başına Tutar (stake_amount) under the Mod & Kaldıraç section
pattern = r"""<div>\s*<label className="block text-xs font-semibold text-slate-400 mb-1">Kaldıraç \(1x - 125x\)</label>"""
repl = """<div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">İşlem Başına Tutar (USD - Marjin)</label>
               <input 
                  type="number" min="1" step="1"
                  value={parsedConfig?.stake_amount || 25}
                  onChange={(e) => handleUpdate("stake_amount", Number(e.target.value))}
                  className="w-full bg-[#0b0e14] border border-slate-700 text-white text-sm rounded-lg p-3 mb-4"
               />
               <p className="text-[10px] text-slate-500 mt-1 mb-4">Bir işleme girecek net nakit miktarıdır (Kaldıraç dahil DEĞİLDİR).</p>
            </div>
            <div>
               <label className="block text-xs font-semibold text-slate-400 mb-1">Kaldıraç (1x - 125x)</label>"""
               
text = re.sub(pattern, repl, text)

with open("src/components/ConfigEditor.tsx", "w") as f:
    f.write(text)
