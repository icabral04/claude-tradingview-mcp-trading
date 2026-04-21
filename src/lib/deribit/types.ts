export type OptionType = "call" | "put";
export type SignalBias = "bullish" | "bearish" | "neutral";

export interface DeribitAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface DeribitInstrument {
  instrument_name: string;
  base_currency: string;
  quote_currency: string;
  kind: "option";
  option_type: OptionType;
  strike: number;
  expiration_timestamp: number;
  settlement_period: string;
  is_active: boolean;
  contract_size: number;
  tick_size: number;
  min_trade_amount: number;
}

export interface DeribitGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface DeribitTicker {
  instrument_name: string;
  state: string;
  mark_price: number;
  mark_iv: number;
  bid_price: number | null;
  bid_iv: number;
  ask_price: number | null;
  ask_iv: number;
  last_price: number | null;
  open_interest: number;
  underlying_price: number;
  underlying_index: string;
  greeks: DeribitGreeks;
  timestamp: number;
}

export interface DeribitPosition {
  instrument_name: string;
  direction: "buy" | "sell";
  size: number;
  average_price: number;
  mark_price: number;
  floating_profit_loss: number;
  realized_profit_loss: number;
  total_profit_loss: number;
  open_orders_margin: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  settlement_price: number;
  index_price: number;
  kind: string;
}

export interface DeribitOrder {
  order_id: string;
  instrument_name: string;
  direction: "buy" | "sell";
  order_type: string;
  order_state: string;
  amount: number;
  price: number | "market";
  filled_amount: number;
  average_price: number;
  creation_timestamp: number;
  last_update_timestamp: number;
  reduce_only: boolean;
  post_only: boolean;
  label: string;
}

export interface PlaceOrderParams {
  instrument_name: string;
  amount: number;
  type: "limit" | "market";
  price?: number;
  label?: string;
  reduce_only?: boolean;
  post_only?: boolean;
}

export interface ScreenedOption {
  instrument_name: string;
  option_type: OptionType;
  strike: number;
  expiration_timestamp: number;
  dte: number;
  mark_iv: number;
  bid_price: number;
  ask_price: number;
  mark_price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  open_interest: number;
  underlying_price: number;
  score: number;
}
