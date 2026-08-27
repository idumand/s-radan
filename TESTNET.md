# Binance Futures Testnet

The app supports two Binance USD-M Futures environments:

- `live`: real Binance Futures account and real funds.
- `testnet`: Binance Futures Testnet account and virtual funds.

## How to use Testnet

1. Create a Binance Futures Testnet account and generate its Testnet API key/secret.
2. Open the app's **Config / Settings** section.
3. Select **TESTNET — Sanal para / gerçek emir akışı testi**.
4. Enter the Testnet API key and secret.
5. Press **Bağlantıyı Test Et**.
6. Only start the trading engine after the connection test reports a Testnet Futures balance.

Testnet credentials are separate from production credentials. Do not paste production API keys while TESTNET is selected.

The backend switches CCXT to sandbox mode before loading markets, and its Futures REST/WebSocket market and trading routes are switched to the Testnet environment. The algorithm itself is unchanged; only the Binance execution/data environment changes.
