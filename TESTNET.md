# Binance Futures Demo/Test

The app supports two Binance USD-M Futures environments:

- `live`: real Binance Futures account and real funds.
- `testnet`: Binance Futures Demo/Test account and virtual funds.

## How to use Testnet

1. Create a Binance Futures Demo/Test account and generate its Testnet API key/secret.
2. Open the app's **Config / Settings** section.
3. Select **TESTNET — Sanal para / gerçek emir akışı testi**.
4. Enter the Testnet API key and secret.
5. Press **Bağlantıyı Test Et**.
6. Only start the trading engine after the connection test reports a Testnet Futures balance.

Demo/Test credentials are separate from production credentials. Do not paste production API keys while TESTNET/DEMO is selected. The application uses the current Binance Futures Demo REST endpoint (`demo-fapi.binance.com`) and routes live PnL from Binance position data.

The backend enables CCXT Binance Demo Trading before loading markets, and its Futures REST/WebSocket market and trading routes use the Demo environment. The algorithm itself is unchanged; only the Binance execution/data environment changes.
