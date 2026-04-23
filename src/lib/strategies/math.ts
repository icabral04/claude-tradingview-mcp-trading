import type { Leg, ScreenedTrade, StrategyId } from "./types";

// ── Crédito ────────────────────────────────────────────────────────────────

export function creditBtc(legs: Leg[]): number {
  return legs.reduce((sum, l) => sum + (l.direction === "sell" ? l.price : -l.price), 0);
}

// ── Breakeven ──────────────────────────────────────────────────────────────

export function breakevenUsd(strategy: StrategyId, legs: Leg[], creditUsd: number): number[] {
  const short = legs.filter((l) => l.direction === "sell");
  switch (strategy) {
    case "sell-put": {
      return [short[0].strike - creditUsd];
    }
    case "sell-call": {
      return [short[0].strike + creditUsd];
    }
    case "bull-put-spread": {
      // short put strike − crédito
      const shortPut = short[0];
      return [shortPut.strike - creditUsd];
    }
    case "bear-call-spread": {
      const shortCall = short[0];
      return [shortCall.strike + creditUsd];
    }
    case "short-strangle":
    case "iron-condor": {
      const shortPut = short.find((l) => l.option_type === "put");
      const shortCall = short.find((l) => l.option_type === "call");
      if (!shortPut || !shortCall) return [];
      return [shortPut.strike - creditUsd, shortCall.strike + creditUsd];
    }
  }
}

// ── Max loss (USD) ─────────────────────────────────────────────────────────

export function maxLossUsd(strategy: StrategyId, legs: Leg[], creditUsd: number): number | null {
  switch (strategy) {
    case "sell-put": {
      // cenário pior: BTC → 0 → perde strike, desconta prêmio
      const k = legs[0].strike;
      return k - creditUsd;
    }
    case "sell-call":
      return null; // teoricamente infinito (BTC → ∞)
    case "bull-put-spread":
    case "bear-call-spread": {
      const [a, b] = legs.map((l) => l.strike);
      const width = Math.abs(a - b);
      return width - creditUsd;
    }
    case "short-strangle":
      return null; // ilimitado do lado call
    case "iron-condor": {
      // perna pior: largura do lado mais estreito - crédito
      const puts = legs.filter((l) => l.option_type === "put");
      const calls = legs.filter((l) => l.option_type === "call");
      const putWidth = Math.abs(puts[0].strike - puts[1].strike);
      const callWidth = Math.abs(calls[0].strike - calls[1].strike);
      return Math.max(putWidth, callWidth) - creditUsd;
    }
  }
}

// ── POP (probability of profit) ────────────────────────────────────────────

/**
 * Aproximação: para short single-leg, POP ≈ 1 - |delta|.
 * Para spreads/neutros, POP ≈ 1 - soma das |deltas| das shorts (limitado a [0,1]).
 * É aproximação — não considera dinâmica de IV nem drift do underlying.
 */
export function popFromLegs(legs: Leg[]): number {
  const shorts = legs.filter((l) => l.direction === "sell");
  const totalShortDelta = shorts.reduce((s, l) => s + Math.abs(l.delta), 0);
  return Math.max(0, Math.min(1, 1 - totalShortDelta));
}

// ── Margem estimada (BTC) ──────────────────────────────────────────────────

/**
 * Estimativa grossa de margem em BTC. Para spreads/IC usa max_loss em USD / spot.
 * Para single-leg naked preferir o valor real do get_margins (feito no enrichment).
 */
export function marginEstimateBtc(
  strategy: StrategyId,
  legs: Leg[],
  maxLossUsdValue: number | null,
  spot: number
): number | null {
  if (maxLossUsdValue === null) {
    // Single-leg naked: fallback 50% do strike em BTC (Deribit cobra algo nessa faixa)
    const shortLeg = legs.find((l) => l.direction === "sell");
    if (!shortLeg) return null;
    return (shortLeg.strike * 0.5) / spot;
  }
  // Spreads e IC: margem ≈ max loss convertido para BTC
  return maxLossUsdValue / spot;
}

// ── ROI anualizado ─────────────────────────────────────────────────────────

export function roiAnnualPct(creditUsd: number, marginUsd: number, dte: number): number | null {
  if (marginUsd <= 0 || dte <= 0) return null;
  return (creditUsd / marginUsd) * (365 / dte) * 100;
}

// ── Gregas agregadas ───────────────────────────────────────────────────────

/**
 * Soma das gregas de cada perna respeitando o sinal da direção.
 * Sell = −1, Buy = +1. Saída em unidades por contrato (1 contrato = 1 BTC na Deribit).
 */
export function aggregateGreeks(legs: Leg[]): ScreenedTrade["greeks"] {
  const g = legs.reduce(
    (acc, l) => {
      const sign = l.direction === "sell" ? -1 : 1;
      acc.delta += sign * l.delta;
      acc.gamma += sign * l.gamma;
      acc.theta += sign * l.theta;
      acc.vega += sign * l.vega;
      return acc;
    },
    { delta: 0, gamma: 0, theta: 0, vega: 0 }
  );
  return {
    delta: round(g.delta, 4),
    gamma: round(g.gamma, 6),
    theta: round(g.theta, 2),
    vega: round(g.vega, 2),
  };
}

// ── Score ──────────────────────────────────────────────────────────────────

/**
 * Score combina ROI anualizado, POP e proximidade do centro do delta range.
 * Trades com risco ilimitado (null maxLoss) ficam penalizados via fallback.
 */
export function scoreTrade(trade: Omit<ScreenedTrade, "score">, deltaCenter: number): number {
  const roi = trade.roi_annual_pct ?? 0;
  // Normaliza ROI: 100% anual = 1.0, cap em 2.0 (200%)
  const roiScore = Math.min(roi / 100, 2);
  // POP direto como score [0,1]
  const popScore = trade.pop;
  // Proximidade do delta alvo (short leg principal)
  const shortLeg = trade.legs.find((l) => l.direction === "sell");
  const deltaDist = shortLeg
    ? 1 - Math.abs(Math.abs(shortLeg.delta) - deltaCenter) / deltaCenter
    : 0;

  return roiScore * 0.4 + popScore * 0.4 + deltaDist * 0.2;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function round(v: number, decimals: number): number {
  const m = 10 ** decimals;
  return Math.round(v * m) / m;
}
