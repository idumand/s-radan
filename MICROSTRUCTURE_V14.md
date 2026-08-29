# V14 Microstructure Upgrade

- Futures-only decision engine; Spot is not used for trading decisions.
- Local Futures order book uses REST snapshot + diff-depth WebSocket updates and publishes the best 50 bid/ask levels.
- Entry emphasis: levels 1-10; confirmation: 11-20 and 21-30; deeper 31-50 liquidity maps movement space.
- Small order noise is down-weighted relative to the symbol's own book distribution.
- Taker money flow is combined with inflow momentum and large-trade pressure.
- Order-book wall persistence/consumption and price-vs-book divergence are tracked over short rolling windows.
- Entry uses a multi-factor score plus a dynamic movement-potential and expected-net-profit gate; a positive score alone is not enough.
- Open positions track peak net PnL and use evidence-based profit protection rather than a single order-book reading.
- Near-balance exits retain the adaptive 3 -> 6 -> 10 measurement confirmation.
- Live UI order book consumes the server's validated Futures book instead of opening a separate Spot/depth20 stream.
- Fake seed prices/candles are not generated for the algorithm; the UI waits for real Futures data.
