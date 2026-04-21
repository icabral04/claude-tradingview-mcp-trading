import type { OptionType, SignalBias } from "@/lib/deribit/types";

export interface ScreeningConfig {
  iv_min: number;
  delta_min: number;
  delta_max: number;
  dte_min: number;
  dte_max: number;
  profit_target_pct: number;
  min_open_interest: number;
  min_bid: number;
  strategy: {
    bullish: "sell_put" | "sell_call";
    bearish: "sell_put" | "sell_call";
    neutral: "iron_condor";
  };
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
  otm_pct: number;
  profit_target: number;
  score: number;
}

export interface ScreeningResult {
  signal: SignalBias;
  btc_price: number;
  screened_at: string;
  option_type_target: OptionType | "both";
  options: ScreenedOption[];
}
