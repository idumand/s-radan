# Binance Futures Environment Isolation Audit

This build enforces a single Binance USDⓈ-M Futures environment at runtime.

## Live
- REST: `https://fapi.binance.com`
- Market WebSocket: `wss://fstream.binance.com/market/stream`
- Public/order-book WebSocket: `wss://fstream.binance.com/public/stream`
- Authenticated orders/positions are created through the Live CCXT Binance Futures instance.

## Testnet / Demo
Binance Futures testing now uses the Demo Trading environment rather than the deprecated Futures Sandbox.
- REST: `https://demo-fapi.binance.com`
- Market WebSocket: `wss://fstream.binancefuture.com/market/stream`
- Public/order-book WebSocket: `wss://fstream.binancefuture.com/public/stream`
- Authenticated orders/positions are created through a CCXT Binance Futures instance after `enableDemoTrading(true)`.

## Isolation rules
1. The browser never opens a Binance WebSocket connection.
2. Every WebSocket client captures the environment at creation time. Messages from an old environment are ignored after a switch.
3. Market caches, order books and rolling microstructure state are cleared on environment changes and API-key reconnection.
4. REST market-data requests capture the environment at request start and reject late responses after an environment switch.
5. A position cannot be opened unless the authenticated exchange environment exactly matches the selected environment.
6. Algorithmic entry requires fresh ticker and order-book data from the selected environment.
7. Futures Demo Trading support is mandatory for Testnet mode; there is no fallback to deprecated sandbox mode or to Live.
8. `/api/v1/data-source` exposes the selected environment, REST/WS endpoints, current authenticated environment and per-symbol data freshness/entry readiness.

This prevents Live market data from being paired with Demo/Testnet execution, and prevents Demo/Testnet credentials from being silently sent to Live endpoints.
