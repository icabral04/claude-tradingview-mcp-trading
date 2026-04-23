import type { StrategyConfig } from "@/lib/strategies/types";

export type HorizonId = "short" | "medium" | "long";

export interface HorizonMeta {
  id: HorizonId;
  label: string;
  subtitle: string;
  dte_min: number;
  dte_max: number;
  /** Perfil para sell-put naked */
  sellPut: StrategyConfig;
  /** Perfil para bull-put-spread */
  bullPutSpread: StrategyConfig;
  /** Pesos do score composto (somam 1.0 idealmente) */
  weights: {
    roi: number;
    pop: number;
    delta_fit: number;
    theta_per_dte: number;
    iv_fit: number;
  };
  /** IV mínimo "saudável" para o horizonte — abaixo disso, flag de aviso */
  iv_threshold_warn: number;
}

/**
 * Curto prazo: theta rico, DTE 1-5, short delta 0.25-0.35.
 * Aqui o gamma é alto — peso maior em delta OTM moderado que rende prêmio rápido.
 */
const SHORT: HorizonMeta = {
  id: "short",
  label: "Curto prazo",
  subtitle: "1–5 dias · theta agressivo",
  dte_min: 1,
  dte_max: 5,
  sellPut: {
    short_delta_min: 0.25,
    short_delta_max: 0.35,
    dte_min: 1,
    dte_max: 5,
    iv_min: 35,
    min_open_interest: 20,
    min_short_price: 0,
    top_n: 30,
  },
  bullPutSpread: {
    short_delta_min: 0.25,
    short_delta_max: 0.35,
    long_delta_min: 0.08,
    long_delta_max: 0.18,
    dte_min: 1,
    dte_max: 5,
    iv_min: 30,
    min_open_interest: 15,
    min_short_price: 0,
    spread_width_min_usd: 500,
    spread_width_max_usd: 3000,
    top_n: 30,
  },
  weights: { roi: 0.45, pop: 0.2, delta_fit: 0.15, theta_per_dte: 0.15, iv_fit: 0.05 },
  iv_threshold_warn: 40,
};

/**
 * Médio prazo: DTE 5-10, short delta 0.15-0.25.
 * Equilíbrio clássico entre prêmio e segurança.
 */
const MEDIUM: HorizonMeta = {
  id: "medium",
  label: "Médio prazo",
  subtitle: "5–10 dias · equilíbrio",
  dte_min: 5,
  dte_max: 10,
  sellPut: {
    short_delta_min: 0.15,
    short_delta_max: 0.25,
    dte_min: 5,
    dte_max: 10,
    iv_min: 30,
    min_open_interest: 15,
    min_short_price: 0,
    top_n: 30,
  },
  bullPutSpread: {
    short_delta_min: 0.18,
    short_delta_max: 0.28,
    long_delta_min: 0.05,
    long_delta_max: 0.15,
    dte_min: 5,
    dte_max: 10,
    iv_min: 25,
    min_open_interest: 10,
    min_short_price: 0,
    spread_width_min_usd: 1000,
    spread_width_max_usd: 4000,
    top_n: 30,
  },
  weights: { roi: 0.35, pop: 0.35, delta_fit: 0.15, theta_per_dte: 0.1, iv_fit: 0.05 },
  iv_threshold_warn: 30,
};

/**
 * Longo prazo: DTE 10-30, short delta 0.10-0.20.
 * Foco em segurança, prêmio gordo em contango.
 */
const LONG: HorizonMeta = {
  id: "long",
  label: "Longo prazo",
  subtitle: "10–30 dias · segurança",
  dte_min: 10,
  dte_max: 30,
  sellPut: {
    short_delta_min: 0.1,
    short_delta_max: 0.2,
    dte_min: 10,
    dte_max: 30,
    iv_min: 25,
    min_open_interest: 10,
    min_short_price: 0,
    top_n: 30,
  },
  bullPutSpread: {
    short_delta_min: 0.15,
    short_delta_max: 0.25,
    long_delta_min: 0.04,
    long_delta_max: 0.12,
    dte_min: 10,
    dte_max: 30,
    iv_min: 22,
    min_open_interest: 10,
    min_short_price: 0,
    spread_width_min_usd: 1500,
    spread_width_max_usd: 6000,
    top_n: 30,
  },
  weights: { roi: 0.25, pop: 0.45, delta_fit: 0.15, theta_per_dte: 0.05, iv_fit: 0.1 },
  iv_threshold_warn: 25,
};

export const HORIZONS: Record<HorizonId, HorizonMeta> = {
  short: SHORT,
  medium: MEDIUM,
  long: LONG,
};

export const HORIZON_ORDER: ReadonlyArray<HorizonId> = ["short", "medium", "long"];
