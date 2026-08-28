import { BotMetrics, StrategyInfo, Trade, MarketPairInfo, LogEntry, Candle } from '../types';

export const INITIAL_METRICS: BotMetrics = {
  total_trades: 0,
  winning_trades: 0,
  losing_trades: 0,
  win_rate: 0,
  total_pnl_usdt: 0,
  total_pnl_pct: 0,
  daily_pnl_usdt: 0,
  balance_usdt: 0,
  starting_balance: 0,
  max_drawdown_pct: 0,
  sharpe_ratio: 0,
  profit_factor: 0,
  open_trades_count: 0,
  max_open_trades: 1,
  stake_amount: 6,
  min_expected_move_pct: 0.5,
  fiat_symbol: 'USD',
  fiat_ratio: 1.0,
};

export const INITIAL_TRADES: Trade[] = [];

export const INITIAL_MARKETS: MarketPairInfo[] = [
  { symbol: 'BTC/USDT', base: 'BTC', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'ETH/USDT', base: 'ETH', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'SOL/USDT', base: 'SOL', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'BNB/USDT', base: 'BNB', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'XRP/USDT', base: 'XRP', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'ADA/USDT', base: 'ADA', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'AVAX/USDT', base: 'AVAX', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: true, in_blacklist: false, signal: 'NEUTRAL' },
  { symbol: 'DOGE/USDT', base: 'DOGE', quote: 'USDT', price: 0, change_24h_pct: 0, volume_24h_usdt: 0, high_24h: 0, low_24h: 0, in_whitelist: false, in_blacklist: true, signal: 'NEUTRAL' },
];

export const STRATEGIES: Record<string, StrategyInfo> = {
  OrderFlow_Quantitative: {
    name: 'OrderFlow_Quantitative_V1',
    description: 'Yüksek frekanslı (HFT) mikroyapı analizi yapan nicel motor. Order Book Imbalance (OBI), Micro-Price ve Hacim Deltasını kullanarak pozisyon yönetir.',
    timeframe: 'tick',
    minimal_roi: {
      '0': 0.05,
      '30': 0.02,
      '60': 0.01
    },
    stoploss: -0.02,
    trailing_stop: true,
    trailing_stop_positive: 0.01,
    process_only_new_candles: false,
    use_exit_signal: true,
    code_python: `# --- OrderFlow Quantitative Engine (Node.js Ported) ---
# Bu strateji matematiksel emir defteri okuması (Order Book Imbalance) yapar.
# Python kod blokları sadece görsel temsildir. Gerçek algoritmik yürütme 
# server.ts içindeki 'executeRealTradeLogic' üzerinden yapılmaktadır.

# 1. Order Book Imbalance (OBI) Hesaplaması
# OBI = (Bid Volume - Ask Volume) / (Bid Volume + Ask Volume)
# Giriş Kriteri: OBI > +0.35 (Alış Baskısı) veya OBI < -0.35 (Satış Baskısı)

# 2. Micro-Price Hesaplaması
# MicroPrice = (V_b * P_a + V_a * P_b) / (V_b + V_a)
# Giriş Kriteri: MicroPrice > MidPrice (Long)

# 3. Hacim Deltası
# Delta = V_taker_buy - V_taker_sell
# Giriş Kriteri: Delta ile OBI'nin aynı yönü teyit etmesi

# 4. Dinamik Kâr Koruma ve Erime (Trailing Stop)
# Zirve fiyattan %1 geri çekilme tespit edildiğinde pozisyon kapatılır.

# 5. Hızlı Negatife Dönüş ve Hard Stop Loss
# Eğer OBI ters yönde -0.20'ye düşerse veya fiyat %2 zarar ederse derhal stop olur.
`
  }
};
export const INITIAL_CONFIG_JSON = JSON.stringify({
  max_open_trades: 1,
  stake_currency: "USDT",
  stake_amount: 6,
  tradable_balance_ratio: 0.99,
  fiat_display_currency: "USD",
  timeframe: "5m",
  dry_run: false,
  leverage: 15,
  stop_loss_pct: 1.0,
  min_expected_move_pct: 0.5,
  take_profit_pct: 0.5,
  cancel_open_orders_on_exit: false,
  trading_mode: "futures",
  margin_mode: "isolated",
  unfilledtimeout: {
    entry: 10,
    exit: 10,
    exit_timeout_count: 0,
    unit: "minutes"
  },
  entry_pricing: {
    price_side: "same",
    use_order_book: true,
    order_book_top: 1
  },
  exit_pricing: {
    price_side: "same",
    use_order_book: true
  },
  exchange: {
    name: "binance",
    key: "",
    secret: "",
    ccxt_config: { "enableRateLimit": true },
    ccxt_async_config: { "enableRateLimit": true },
    pair_whitelist: [
      "BTC/USDT",
      "ETH/USDT",
      "SOL/USDT",
      "BNB/USDT",
      "XRP/USDT",
      "ADA/USDT"
    ],
    pair_blacklist: [
      "DOGE/USDT"
    ],
    environment: "live"
  },
  pairlists: [
    { "method": "StaticPairList" },
    { "method": "VolumePairList", "number_assets": 20, "sort_key": "quoteVolume" }
  ],
  api_server: {
    enabled: true,
    listen_ip_address: "0.0.0.0",
    listen_port: 3000,
    verbosity: "info"
  },
  bot_name: "freqtrade_sfeef_bot",
  initial_state: "running"
}, null, 2);

export function generateCandles(_symbol: string, _timeframe: string, _count = 80): Candle[] {
  // Gerçek veri yoksa sahte mum üretme. Grafik, gerçek Futures kline verisi gelene kadar boş kalır.
  return [];
}


// Empty by default: live logs come from the server; do not synthesize trading history.
export const INITIAL_LOGS: any[] = [];
