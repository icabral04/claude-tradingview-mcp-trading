import type { ScreenedTrade, StrategyConfig } from "../types";
import {
  aggregateGreeks,
  breakevenUsd,
  creditBtc,
  marginEstimateBtc,
  maxLossUsd,
  popFromLegs,
  roiAnnualPct,
  round,
  scoreTrade,
} from "../math";
import { filterByType, groupByExpiry, loadBook, quoteToLeg } from "../book";

/**
 * Short strangle: vende 1 PUT OTM + 1 CALL OTM no mesmo vencimento.
 * Ambos no range de delta_short. Risco ilimitado nos dois lados.
 */
export async function screenShortStrangle(
  cfg: StrategyConfig
): Promise<{ spot: number; trades: ScreenedTrade[]; stats: { total: number; filtered: number } }> {
  const { spot, quotes } = await loadBook(cfg.dte_min, cfg.dte_max);
  const puts = filterByType(quotes, "put");
  const calls = filterByType(quotes, "call");
  const putsByExpiry = groupByExpiry(puts);
  const callsByExpiry = groupByExpiry(calls);

  const deltaCenter = (cfg.short_delta_min + cfg.short_delta_max) / 2;
  const trades: ScreenedTrade[] = [];
  let totalCandidates = 0;

  for (const [expiry, putList] of putsByExpiry) {
    const callList = callsByExpiry.get(expiry);
    if (!callList) continue;

    const putShorts = putList.filter((q) => {
      const d = Math.abs(q.ticker.greeks?.delta ?? 0);
      if (d < cfg.short_delta_min || d > cfg.short_delta_max) return false;
      if ((q.ticker.mark_iv ?? 0) < cfg.iv_min) return false;
      if ((q.ticker.open_interest ?? 0) < cfg.min_open_interest) return false;
      if (q.price < cfg.min_short_price) return false;
      return true;
    });
    const callShorts = callList.filter((q) => {
      const d = Math.abs(q.ticker.greeks?.delta ?? 0);
      if (d < cfg.short_delta_min || d > cfg.short_delta_max) return false;
      if ((q.ticker.mark_iv ?? 0) < cfg.iv_min) return false;
      if ((q.ticker.open_interest ?? 0) < cfg.min_open_interest) return false;
      if (q.price < cfg.min_short_price) return false;
      return true;
    });
    // Pré-computa |delta| das call shorts uma vez para argmin O(n) por put.
    const callShortsWithDelta = callShorts.map((c) => ({
      q: c,
      absDelta: Math.abs(c.ticker.greeks?.delta ?? 0),
    }));

    // Casa cada put com a call de delta mais próximo (estrutura simétrica)
    for (const putQ of putShorts) {
      const putAbs = Math.abs(putQ.ticker.greeks?.delta ?? 0);
      let callQ = callShortsWithDelta[0]?.q;
      let bestDist = callShortsWithDelta[0] ? Math.abs(callShortsWithDelta[0].absDelta - putAbs) : Infinity;
      for (let i = 1; i < callShortsWithDelta.length; i++) {
        const dist = Math.abs(callShortsWithDelta[i].absDelta - putAbs);
        if (dist < bestDist) {
          bestDist = dist;
          callQ = callShortsWithDelta[i].q;
        }
      }
      if (!callQ) continue;
      totalCandidates++;

      const putLeg = quoteToLeg(putQ, "sell");
      const callLeg = quoteToLeg(callQ, "sell");
      const legs = [putLeg, callLeg];

      const credit = creditBtc(legs);
      const creditUsd = credit * spot;
      const maxLoss = maxLossUsd("short-strangle", legs, creditUsd);
      const margin = marginEstimateBtc("short-strangle", legs, maxLoss, spot) ?? 1;
      const marginUsd = margin * spot;

      const base = {
        strategy: "short-strangle" as const,
        legs,
        expiration_timestamp: expiry,
        dte: round(putQ.dte, 1),
        credit_btc: round(credit, 6),
        credit_usd: round(creditUsd, 2),
        max_loss_usd: maxLoss !== null ? round(maxLoss, 2) : null,
        breakeven_usd: breakevenUsd("short-strangle", legs, creditUsd).map((v) => round(v, 2)),
        pop: round(popFromLegs(legs), 3),
        roi_annual_pct: roiAnnualPct(creditUsd, marginUsd, putQ.dte),
        risk_reward: maxLoss !== null && creditUsd > 0 ? round(maxLoss / creditUsd, 2) : null,
        greeks: aggregateGreeks(legs),
        meta: {
          put_strike: putLeg.strike,
          call_strike: callLeg.strike,
          width_usd: callLeg.strike - putLeg.strike,
        },
      };
      trades.push({ ...base, score: round(scoreTrade(base, deltaCenter), 3) });
    }
  }

  trades.sort((a, b) => b.score - a.score);
  return { spot, trades: trades.slice(0, cfg.top_n), stats: { total: puts.length + calls.length, filtered: totalCandidates } };
}
