import re

with open("src/data/initialData.ts", "r") as f:
    text = f.read()

# Add stake_amount to config explicitly so it renders 
pattern = r"""stake_amount: 1000,"""
repl = """stake_amount: 25,"""
text = re.sub(pattern, repl, text)

with open("src/data/initialData.ts", "w") as f:
    f.write(text)
