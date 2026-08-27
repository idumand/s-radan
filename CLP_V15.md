# V15 – Counterfactual Liquidity Path (CLP)

This release adds a deterministic, explainable target-selection layer on top of the existing Futures-only order-flow engine.

## Core idea
Instead of treating the first visible wall as the target, CLP evaluates the path through the visible opposing liquidity up to 50 levels. It compares cumulative opposing notional with the observed aggressive-trade flow rate, then adjusts the path score for spread, volatility, liquidity consumption, wall persistence and directional money-flow alignment.

The model outputs:
- `targetPathScore`: 0–100 path reachability score (not a guaranteed probability).
- `edgeScore`: combined directional edge + path quality score.
- `expectedTargetPrice`: selected target on the best visible path.
- `expectedNetProfitUSD`: expected net profit after estimated fees/spread/slippage.
- historical target hit rate when enough closed trades exist.

## Entry gate
A candidate must satisfy both the existing directional/money-flow gates and:
- target path score >= 65
- edge score >= 68
- meaningful expected net profit

## Exit behavior
The existing peak-profit protection and 3→6→10 confirmation remain active. The model target is locked at entry so it can be evaluated after the trade closes.
