export type BotState = 'running' | 'stopped';
export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface BotMetrics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl_usdt: number;
  total_pnl_pct: number;
  daily_pnl_usdt: number;
  balance_usdt: number;
  starting_balance: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  profit_factor: number;
  open_trades_count: number;
  max_open_trades: number;
  stake_amount: number | 'unlimited';
  fiat_symbol: string;
  fiat_ratio: number;
}

export interface Trade {
  id: string;
  pair: string;
  is_open: boolean;
  type: 'long' | 'short';
  amount: number;
  leverage: number;
  open_rate: number;
  current_rate: number;
  close_rate?: number;
  open_date: string;
  close_date?: string;
  close_reason?: string;
  profit_ratio: number;
  profit_pct: number;
  profit_abs: number;
  target_pct?: number;
  risk_profile?: string;
  deep_score?: number;
  stop_loss_abs: number;
  stop_loss_pct: number;
  initial_stop_loss_pct?: number;
  take_profit_pct?: number;
  model_target_profit_usd?: number;
  model_target_price?: number;
  model_target_confidence?: number;
  model_target_accuracy_sample?: number;
  model_target_accuracy_rate?: number | null;
  fee_open: number;
  fee_close?: number;
}

export interface MarketPairInfo {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  change_24h_pct: number;
  volume_24h_usdt: number;
  high_24h: number;
  low_24h: number;
  in_whitelist: boolean;
  in_blacklist: boolean;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'TRADE' | 'SYSTEM';
  message: string;
}

export interface StrategyInfo {
  name: string;
  description: string;
  timeframe: string;
  minimal_roi: Record<string, number>;
  stoploss: number;
  trailing_stop: boolean;
  trailing_stop_positive: number;
  process_only_new_candles: boolean;
  use_exit_signal: boolean;
  code_python?: string;
}

export interface Candle {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number;
  sma50?: number;
  bbUpper?: number;
  bbLower?: number;
  rsi?: number;
}
