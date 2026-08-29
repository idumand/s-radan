# Settings audit / V17

- `min_expected_move_pct` is now a decimal-safe entry filter with range 0.5–20 and no integer rounding.
- `take_profit_pct` is a separate manual TP setting with range 0.1–20 and decimal support (e.g. 0.5).
- Each opened position captures the TP percentage at entry so changing settings does not unexpectedly alter an already-open trade.
- Save normalizes comma decimals (`0,5`) to numbers (`0.5`) and preserves them.
- Defaults: manual mode, $6 margin, 15x leverage, max 1 open trade, 0.5% entry filter, 0.5% TP, 1.0% SL.
- A "Varsayılanlar" action resets trading settings without deleting the Binance API credentials or coin whitelist.
- Output package intentionally omits the previously embedded API credentials; enter them again in the Binance settings screen.
