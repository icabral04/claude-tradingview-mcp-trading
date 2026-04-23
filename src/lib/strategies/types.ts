import type { OptionType, DeribitTicker, DeribitInstrument } from "@/lib/deribit/types";

export type StrategyId =
  | "sell-put"
  | "sell-call"
  | "bull-put-spread"
  | "bear-call-spread"
  | "short-strangle"
  | "iron-condor";

export type StrategyBias = "bullish" | "bearish" | "neutral";
export type Regime = "any" | "high-iv" | "range-bound";

export interface StrategyMeta {
  id: StrategyId;
  label: string;
  description: string;
  bias: StrategyBias;
  legs: number;
  risk_profile: "unlimited" | "limited" | "unlimited-one-side";
  ideal_regime: Regime;
}

export interface Leg {
  instrument_name: string;
  option_type: OptionType;
  strike: number;
  direction: "buy" | "sell";
  dte: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  mark_iv: number;
  /** Preço efetivo usado na operação (BTC): bid_price se > 0, senão mark_price */
  price: number;
  price_source: "bid" | "mark";
  bid_price: number;
  ask_price: number;
  mark_price: number;
  open_interest: number;
}

export interface ScreenedTrade {
  strategy: StrategyId;
  legs: Leg[];
  expiration_timestamp: number;
  dte: number;
  /** Crédito líquido recebido em BTC (positivo = recebe; negativo = paga) */
  credit_btc: number;
  credit_usd: number;
  /** Prejuízo máximo teórico em USD (null = ilimitado) */
  max_loss_usd: number | null;
  /** Breakeven(s) em USD */
  breakeven_usd: number[];
  /** Probabilidade aproximada de profit (0-1) via delta das short legs */
  pop: number;
  /** ROI anualizado sobre margem estimada (%) — null quando max_loss infinito */
  roi_annual_pct: number | null;
  /** Risk/Reward ratio (max_loss / credit) — null quando max_loss infinito */
  risk_reward: number | null;
  /** Gregas agregadas da posição (sell = −1, buy = +1) — em unidades por contrato */
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  /** Score interno para ordenação (maior = melhor) */
  score: number;
  /** Metadados que o renderer usa (ex.: strike curto/longo nos spreads) */
  meta: Record<string, number | string>;
}

export interface StrategyConfig {
  /** Range de delta da short leg (absoluto) */
  short_delta_min: number;
  short_delta_max: number;
  /** Range de delta da long leg (proteção) — usado em spreads */
  long_delta_min?: number;
  long_delta_max?: number;
  /** DTE da janela */
  dte_min: number;
  dte_max: number;
  /** IV mínimo (mark_iv da short leg) */
  iv_min: number;
  /** Open interest mínimo por perna */
  min_open_interest: number;
  /** Preço mínimo da short leg (BTC) — 0 permite aceitar mark quando bid=0 */
  min_short_price: number;
  /** Largura mínima/máxima do spread em USD — usado em spreads */
  spread_width_min_usd?: number;
  spread_width_max_usd?: number;
  /** Quantos resultados retornar */
  top_n: number;
}

export interface ScreeningResultV2 {
  strategy: StrategyId;
  bias: StrategyBias;
  btc_price: number;
  screened_at: string;
  trades: ScreenedTrade[];
  meta: {
    total_instruments: number;
    candidates_after_dte: number;
    candidates_after_type: number;
    candidates_after_filters: number;
    iv_rank: number | null;
  };
}

/** Par ticker + instrument para passar pelos screeners */
export interface EnrichedQuote {
  instrument: DeribitInstrument;
  ticker: DeribitTicker;
  dte: number;
  price: number;
  price_source: "bid" | "mark";
}
