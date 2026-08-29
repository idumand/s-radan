# Binance Futures Demo/Test

The app supports two Binance USD-M Futures environments:

- `live`: real Binance Futures account and real funds.
- `testnet`: Binance Futures Demo/Test account and virtual funds.

## How to use Testnet

1. Create a Binance Futures Demo Trading account and generate the API key/secret from the Demo Trading API management page. The Demo/Test credentials are separate from production credentials.
2. Open the app's **Config / Settings** section.
3. Select **TESTNET — Sanal para / gerçek emir akışı testi**.
4. Enter the Testnet API key and secret.
5. Press **Bağlantıyı Test Et**.
6. Only start the trading engine after the connection test reports a Testnet Futures balance.

Demo/Test credentials are separate from production credentials. Do not paste production API keys while TESTNET/DEMO is selected. The application uses the current Binance Futures Demo REST endpoint (`demo-fapi.binance.com`) and routes live PnL from Binance position data.

The backend requires CCXT Binance Demo Trading before loading markets, and its Futures REST/WebSocket market and trading routes use the Demo environment. Deprecated sandbox fallback is disabled. The algorithm itself is unchanged; only the Binance execution/data environment changes.


## Market-data isolation (updated)

The browser never connects directly to Binance. All market data is routed through the Node.js backend, which uses the selected environment for REST and WebSocket independently.

For USD-M Futures the backend uses separate WebSocket routes for the two data classes:

- `MARKET`: ticker and aggTrade → `wss://fstream.binancefuture.com/market/stream`
- `PUBLIC`: order-book/depth → `wss://fstream.binancefuture.com/public/stream`

When `exchange.environment` is `testnet`, both routes use the Binance Futures Demo/Test host. No production WebSocket URL is used by the frontend. This prevents LIVE ticker/order-book data from being mixed with Testnet execution.

The current Binance Futures WebSocket architecture separates regular market streams from high-frequency public streams; the application follows that split. The host used for Futures Demo/Test is `fstream.binancefuture.com`, as documented by Binance.
