# Trading/PnL Audit – Fixed

## Critical PnL fixes
- Removed synthetic seeded historical trades (the old startup history contained fabricated trades and PnL percentages).
- Removed browser-side recalculation of authenticated Binance PnL. The backend is now authoritative for live Binance/Testnet positions.
- Authenticated Binance positions use Binance `unrealizedPnl` and mark price for the displayed live PnL/ROE.
- The ROE denominator prefers Binance-reported position initial margin and falls back to notional/leverage.
- Added an explicit `pnl_source` field (`binance`, `local`, `closed_record`) and visible UI labels for Binance-sourced PnL.
- Disabled local/simulation position creation entirely. Without an authenticated Binance account, the app can scan markets but will not create fake positions.

## Position/execution fixes
- Fixed short/long detection to respect a signed Binance `positionAmt` when `side` is absent or unreliable.
- When a Binance position disappears outside the app, the server now attempts to resolve the real exit fill from the stop order or recent closed orders and records the resulting PnL/ROE.
- Restart recovery no longer resurrects stale local/open positions from `trades_history.json`; currently open positions are reconstructed from Binance.

## Binance environment fixes
- Futures Demo/Test REST remains on `https://demo-fapi.binance.com`.
- Futures Demo/Test market-data WebSocket uses `wss://fstream.binancefuture.com` rather than the obsolete/wrong demo-fstream host used by this build.
- Removed legacy Futures testnet REST/Spot fallback URLs that could return misleading authentication errors.
- Updated the UI instructions to use Binance Demo Trading for Futures testing.

## Validation
- TypeScript/TSX transpilation syntax checks pass for the edited files.
- No synthetic trade seed remains.
- No legacy `testnet.binancefuture.com` or `testnet.binance.vision` endpoint reference remains in the delivered app.
- Full `npm install`/production build could not be executed in this environment because the npm registry is not reachable from the build container; dependencies were therefore not installed here.

## V18 deep-audit fixes
- Fixed short-position exit sizing to always use absolute contract quantity; a signed `positionAmt` could otherwise prevent closing a short.
- Fixed Binance position synchronization to prioritize actual `contracts` / signed `positionAmt` rather than `contractSize`.
- Removed the artificial `$0.50` floor from `expectedNetProfitUSD`; the entry profit filter now uses the real modelled net result after estimated fee/spread/slippage.
- Fixed ordinary Settings saves so hidden API credentials are preserved when `/api/v1/config` is loaded without secrets.
- Added a real `margin_mode` setting and applied it to Binance Futures orders instead of hardcoding `CROSSED`.
- Aligned UI/server defaults to $6 margin, 15x leverage, 0.5% entry filter, 0.5% TP and 1.0% SL.
- Made server WebSocket restarts generation-safe so an old socket cannot spawn duplicate reconnect loops after a settings/environment change.
- Browser market-data WebSocket now reacts to the selected Binance environment instead of staying on the environment that existed at first render.
- Position stop prices use exchange precision when available instead of a fixed 2-decimal rounding that is unsuitable for low-priced futures symbols.
