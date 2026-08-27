import re

with open("server.ts", "r") as f:
    text = f.read()

# Add global state variable for stake_amount
text = text.replace('let activeSmartTargetPct: 3 | 5 | 10 | 15 = 10;', 'let activeSmartTargetPct: 3 | 5 | 10 | 15 = 10;\nlet activeStakeAmount = 25;')

# Read it from config in initializeExchange
init_pattern = r"if \(conf\?\.smart_target\) activeSmartTargetPct = conf\.smart_target;"
init_repl = """if (conf?.smart_target) activeSmartTargetPct = conf.smart_target;
    if (conf?.stake_amount) activeStakeAmount = conf.stake_amount;"""
text = re.sub(init_pattern, init_repl, text)

# Update config GET route
get_pattern = r"""smart_target: activeSmartTargetPct"""
get_repl = """smart_target: activeSmartTargetPct,
      stake_amount: activeStakeAmount"""
text = re.sub(get_pattern, get_repl, text)

# Update config POST route
post_pattern = r"""if \(conf\.smart_target\) activeSmartTargetPct = conf\.smart_target;"""
post_repl = """if (conf.smart_target) activeSmartTargetPct = conf.smart_target;
  if (conf.stake_amount) activeStakeAmount = conf.stake_amount;"""
text = re.sub(post_pattern, post_repl, text)

# Update executeEntry logic to use activeStakeAmount
entry_pattern = r"""let rawAmount = 25 / currentPrice; // Approx \$25 margin base example"""
entry_repl = """let rawAmount = activeStakeAmount / currentPrice;"""
text = re.sub(entry_pattern, entry_repl, text)

with open("server.ts", "w") as f:
    f.write(text)
