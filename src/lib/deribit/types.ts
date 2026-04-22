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

export interface DeribitBookSummary {
  instrument_name: string;
  base_currency: string;
  quote_currency: string;
  mid_price: number | null;
  mark_price: number;
  last: number | null;
  low: number | null;
  high: number | null;
  bid_price: number | null;
  ask_price: number | null;
  open_interest: number;
  volume: number;
  volume_usd: number;
  volume_notional: number;
  mark_iv?: number;
  underlying_price?: number;
  underlying_index?: string;
  creation_timestamp: number;
  price_change?: number;
  estimated_delivery_price?: number;
}

export interface DeribitAccountSummary {
  currency: string;
  balance: number;
  equity: number;
  available_funds: number;
  margin_balance: number;
  initial_margin: number;
  maintenance_margin: number;
  options_delta: number;
  options_gamma: number;
  options_theta: number;
  options_vega: number;
  options_pl: number;
  options_value: number;
  options_session_rpl: number;
  options_session_upl: number;
  session_rpl: number;
  session_upl: number;
  session_funding: number;
  delta_total: number;
  projected_delta_total: number;
  futures_pl: number;
  futures_session_rpl: number;
  futures_session_upl: number;
  total_pl: number;
  creation_timestamp: number;
  limits?: {
    non_matching_engine_burst: number;
    non_matching_engine: number;
    matching_engine_burst: number;
    matching_engine: number;
  };
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
  margin_sell: number | null;
  roi_real: number | null;
}
