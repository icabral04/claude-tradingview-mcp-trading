import type { ScreenedTrade } from "@/lib/strategies/types";
import type { HorizonMeta } from "./horizons";

export interface ScoredPick extends ScreenedTrade {
  horizon_score: number;
  components: {
    roi: number;
    pop: number;
    delta_fit: number;
    theta_per_dte: number;
    iv_fit: number;
  };
  warnings: string[];
}

/**
 * Centro alvo de delta da short leg por horizonte.
 * Usa o centro do range do sell-put (que é mais estreito que o do spread).
 */
function deltaCenter(h: HorizonMeta): number {
  return (h.sellPut.short_delta_min + h.sellPut.short_delta_max) / 2;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Rescoreia um trade sob a ótica do horizonte:
 * - roi: ROI anualizado normalizado (100% = 1.0, cap 200%)
 * - pop: prob. de profit (já 0-1)
 * - delta_fit: quão perto o short delta está do centro alvo
 * - theta_per_dte: theta diário em USD por BTC de margem (proxy "renda por dia")
 * - iv_fit: IV da short leg vs threshold saudável do horizonte
 */
export function rescoreForHorizon(
  trade: ScreenedTrade,
  h: HorizonMeta,
  spot: number
): ScoredPick {
  const center = deltaCenter(h);
  const shortLeg = trade.legs.find((l) => l.direction === "sell");
  const shortDelta = shortLeg ? Math.abs(shortLeg.delta) : 0;
  const shortIv = shortLeg?.mark_iv ?? 0;

  const roiPct = trade.roi_annual_pct ?? 0;
  const roiNorm = clamp01(roiPct / 200);
  const popNorm = clamp01(trade.pop);
  const deltaFit = clamp01(1 - Math.abs(shortDelta - center) / center);

  // theta_per_dte: |theta_agregado em USD| / DTE. theta já é USD por 1 BTC (Deribit).
  const thetaUsdPerDay = Math.abs(trade.greeks.theta);
  const thetaPerDteRaw = trade.dte > 0 ? thetaUsdPerDay / trade.dte : 0;
  // normaliza contra ~0.3% do spot/dia como "excelente" (0.3% = theta BTC puro top tier)
  const thetaPerDteNorm = clamp01(thetaPerDteRaw / (spot * 0.003));

  const ivFit = clamp01(shortIv / Math.max(h.iv_threshold_warn, 1));

  const w = h.weights;
  const score =
    w.roi * roiNorm +
    w.pop * popNorm +
    w.delta_fit * deltaFit +
    w.theta_per_dte * thetaPerDteNorm +
    w.iv_fit * ivFit;

  const warnings: string[] = [];
  if (shortIv < h.iv_threshold_warn) warnings.push(`IV ${shortIv.toFixed(0)}% abaixo do alvo (${h.iv_threshold_warn}%)`);
  if (shortLeg && shortLeg.bid_price === 0) warnings.push("Bid zerado na short — usando mark");
  if (trade.pop < 0.6) warnings.push("POP < 60% — trade direcional");
  if (trade.strategy === "sell-put" && trade.max_loss_usd && trade.max_loss_usd > spot * 0.5) {
    warnings.push("Downside alto (naked) — considere spread");
  }

  return {
    ...trade,
    horizon_score: Math.round(score * 1000) / 1000,
    components: {
      roi: Math.round(roiNorm * 1000) / 1000,
      pop: Math.round(popNorm * 1000) / 1000,
      delta_fit: Math.round(deltaFit * 1000) / 1000,
      theta_per_dte: Math.round(thetaPerDteNorm * 1000) / 1000,
      iv_fit: Math.round(ivFit * 1000) / 1000,
    },
    warnings,
  };
}
