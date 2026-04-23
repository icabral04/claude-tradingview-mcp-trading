import type { ScreenedTrade, StrategyConfig, StrategyId, StrategyMeta } from "./types";
import { screenSingleLeg } from "./single/single-leg";
import { screenBullPutSpread } from "./spreads/bull-put";
import { screenBearCallSpread } from "./spreads/bear-call";
import { screenShortStrangle } from "./neutral/short-strangle";
import { screenIronCondor } from "./neutral/iron-condor";

/**
 * Ordem proposital: PUT primeiro (foco do produto), depois CALL, depois neutras.
 * Em UI, sell-put e bull-put-spread são tratadas como "primárias".
 */
export const STRATEGIES: Record<StrategyId, StrategyMeta> = {
  "sell-put": {
    id: "sell-put",
    label: "Sell Put",
    description: "Vende put OTM. Lucra se BTC ficar acima do strike. Risco grande no downside.",
    bias: "bullish",
    legs: 1,
    risk_profile: "unlimited",
    ideal_regime: "high-iv",
  },
  "bull-put-spread": {
    id: "bull-put-spread",
    label: "Bull Put Spread",
    description: "Vende put + compra put mais OTM. Crédito menor, risco limitado.",
    bias: "bullish",
    legs: 2,
    risk_profile: "limited",
    ideal_regime: "any",
  },
  "sell-call": {
    id: "sell-call",
    label: "Sell Call",
    description: "Vende call OTM. Lucra se BTC ficar abaixo do strike. Risco infinito no upside.",
    bias: "bearish",
    legs: 1,
    risk_profile: "unlimited",
    ideal_regime: "high-iv",
  },
  "bear-call-spread": {
    id: "bear-call-spread",
    label: "Bear Call Spread",
    description: "Vende call + compra call mais OTM. Crédito menor, risco limitado.",
    bias: "bearish",
    legs: 2,
    risk_profile: "limited",
    ideal_regime: "any",
  },
  "short-strangle": {
    id: "short-strangle",
    label: "Short Strangle",
    description: "Vende put OTM + call OTM. Lucra se BTC ficar entre os strikes. Risco bilateral.",
    bias: "neutral",
    legs: 2,
    risk_profile: "unlimited",
    ideal_regime: "range-bound",
  },
  "iron-condor": {
    id: "iron-condor",
    label: "Iron Condor",
    description: "Bull put spread + bear call spread. Risco e ganho limitados nos dois lados.",
    bias: "neutral",
    legs: 4,
    risk_profile: "limited",
    ideal_regime: "any",
  },
};

/** Estratégias primárias do produto (foco PUT). Usado por UI pra dar destaque. */
export const PRIMARY_STRATEGIES: ReadonlyArray<StrategyId> = ["sell-put", "bull-put-spread"];

export function isPrimaryStrategy(id: StrategyId): boolean {
  return PRIMARY_STRATEGIES.includes(id);
}

export const DEFAULT_CONFIGS: Record<StrategyId, StrategyConfig> = {
  "sell-put": {
    short_delta_min: 0.15,
    short_delta_max: 0.30,
    dte_min: 7,
    dte_max: 45,
    iv_min: 30,
    min_open_interest: 10,
    min_short_price: 0,
    top_n: 20,
  },
  "sell-call": {
    short_delta_min: 0.15,
    short_delta_max: 0.30,
    dte_min: 7,
    dte_max: 45,
    iv_min: 30,
    min_open_interest: 10,
    min_short_price: 0,
    top_n: 20,
  },
  "bull-put-spread": {
    short_delta_min: 0.20,
    short_delta_max: 0.35,
    long_delta_min: 0.05,
    long_delta_max: 0.15,
    dte_min: 7,
    dte_max: 45,
    iv_min: 25,
    min_open_interest: 10,
    min_short_price: 0,
    spread_width_min_usd: 1000,
    spread_width_max_usd: 5000,
    top_n: 20,
  },
  "bear-call-spread": {
    short_delta_min: 0.20,
    short_delta_max: 0.35,
    long_delta_min: 0.05,
    long_delta_max: 0.15,
    dte_min: 7,
    dte_max: 45,
    iv_min: 25,
    min_open_interest: 10,
    min_short_price: 0,
    spread_width_min_usd: 1000,
    spread_width_max_usd: 5000,
    top_n: 20,
  },
  "short-strangle": {
    short_delta_min: 0.15,
    short_delta_max: 0.25,
    dte_min: 14,
    dte_max: 45,
    iv_min: 30,
    min_open_interest: 10,
    min_short_price: 0,
    top_n: 20,
  },
  "iron-condor": {
    short_delta_min: 0.15,
    short_delta_max: 0.25,
    long_delta_min: 0.05,
    long_delta_max: 0.10,
    dte_min: 14,
    dte_max: 45,
    iv_min: 25,
    min_open_interest: 10,
    min_short_price: 0,
    spread_width_min_usd: 1000,
    spread_width_max_usd: 5000,
    top_n: 20,
  },
};

export type RunResult = {
  spot: number;
  trades: ScreenedTrade[];
  stats: { total: number; filtered: number };
};

export async function runStrategy(id: StrategyId, cfg: StrategyConfig): Promise<RunResult> {
  switch (id) {
    case "sell-put":
    case "sell-call":
      return screenSingleLeg(id, cfg);
    case "bull-put-spread":
      return screenBullPutSpread(cfg);
    case "bear-call-spread":
      return screenBearCallSpread(cfg);
    case "short-strangle":
      return screenShortStrangle(cfg);
    case "iron-condor":
      return screenIronCondor(cfg);
  }
}
