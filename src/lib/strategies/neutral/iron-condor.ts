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
 * Iron Condor: bull-put-spread + bear-call-spread no mesmo vencimento.
 * Quatro pernas: short put + long put (mais OTM) + short call + long call (mais OTM).
 * Risco limitado pela maior largura.
 */
export async function screenIronCondor(
  cfg: StrategyConfig
): Promise<{ spot: number; trades: ScreenedTrade[]; stats: { total: number; filtered: number } }> {
  const { spot, quotes } = await loadBook(cfg.dte_min, cfg.dte_max);
  const puts = filterByType(quotes, "put");
  const calls = filterByType(quotes, "call");
  const putsByExpiry = groupByExpiry(puts);
  const callsByExpiry = groupByExpiry(calls);

  const longDeltaMin = cfg.long_delta_min ?? 0.05;
  const longDeltaMax = cfg.long_delta_max ?? cfg.short_delta_min - 0.01;
  const widthMin = cfg.spread_width_min_usd ?? 1000;
  const widthMax = cfg.spread_width_max_usd ?? 5000;

  const deltaCenter = (cfg.short_delta_min + cfg.short_delta_max) / 2;
  const trades: ScreenedTrade[] = [];
  let totalCandidates = 0;

  for (const [expiry, putList] of putsByExpiry) {
    const callList = callsByExpiry.get(expiry);
    if (!callList) continue;

    const filterShort = (q: (typeof putList)[number]) => {
      const d = Math.abs(q.ticker.greeks?.delta ?? 0);
      if (d < cfg.short_delta_min || d > cfg.short_delta_max) return false;
      if ((q.ticker.mark_iv ?? 0) < cfg.iv_min) return false;
      if ((q.ticker.open_interest ?? 0) < cfg.min_open_interest) return false;
      if (q.price < cfg.min_short_price) return false;
      return true;
    };
    const filterLong = (q: (typeof putList)[number]) => {
      const d = Math.abs(q.ticker.greeks?.delta ?? 0);
      return d >= longDeltaMin && d <= longDeltaMax;
    };

    const putShorts = putList.filter(filterShort);
    const putLongs = putList.filter(filterLong);
    const callShorts = callList.filter(filterShort);
    const callLongs = callList.filter(filterLong);

    // Pré-computa |delta| das call shorts uma vez para argmin O(n) por put.
    const callShortsWithDelta = callShorts.map((c) => ({
      q: c,
      absDelta: Math.abs(c.ticker.greeks?.delta ?? 0),
    }));

    for (const putShort of putShorts) {
      const putAbs = Math.abs(putShort.ticker.greeks?.delta ?? 0);
      let callShort = callShortsWithDelta[0]?.q;
      let bestDist = callShortsWithDelta[0] ? Math.abs(callShortsWithDelta[0].absDelta - putAbs) : Infinity;
      for (let i = 1; i < callShortsWithDelta.length; i++) {
        const dist = Math.abs(callShortsWithDelta[i].absDelta - putAbs);
        if (dist < bestDist) {
          bestDist = dist;
          callShort = callShortsWithDelta[i].q;
        }
      }
      if (!callShort) continue;

      // melhor put long = a mais barata (maximiza crédito líquido = short - long)
      let putLong: typeof putLongs[number] | undefined;
      let putLongCheapest = Infinity;
      for (const l of putLongs) {
        const w = putShort.instrument.strike - l.instrument.strike;
        if (w < widthMin || w > widthMax) continue;
        if (l.price < putLongCheapest) {
          putLongCheapest = l.price;
          putLong = l;
        }
      }
      let callLong: typeof callLongs[number] | undefined;
      let callLongCheapest = Infinity;
      for (const l of callLongs) {
        const w = l.instrument.strike - callShort.instrument.strike;
        if (w < widthMin || w > widthMax) continue;
        if (l.price < callLongCheapest) {
          callLongCheapest = l.price;
          callLong = l;
        }
      }

      if (!putLong || !callLong) continue;
      totalCandidates++;

      const legs = [
        quoteToLeg(putShort, "sell"),
        quoteToLeg(putLong, "buy"),
        quoteToLeg(callShort, "sell"),
        quoteToLeg(callLong, "buy"),
      ];

      const credit = creditBtc(legs);
      if (credit <= 0) continue;
      const creditUsd = credit * spot;
      const maxLoss = maxLossUsd("iron-condor", legs, creditUsd);
      const margin = marginEstimateBtc("iron-condor", legs, maxLoss, spot) ?? 1;
      const marginUsd = margin * spot;

      const putWidth = putShort.instrument.strike - putLong.instrument.strike;
      const callWidth = callLong.instrument.strike - callShort.instrument.strike;

      const base = {
        strategy: "iron-condor" as const,
        legs,
        expiration_timestamp: expiry,
        dte: round(putShort.dte, 1),
        credit_btc: round(credit, 6),
        credit_usd: round(creditUsd, 2),
        max_loss_usd: maxLoss !== null ? round(maxLoss, 2) : null,
        breakeven_usd: breakevenUsd("iron-condor", legs, creditUsd).map((v) => round(v, 2)),
        pop: round(popFromLegs(legs), 3),
        roi_annual_pct: roiAnnualPct(creditUsd, marginUsd, putShort.dte),
        risk_reward: maxLoss !== null && creditUsd > 0 ? round(maxLoss / creditUsd, 2) : null,
        greeks: aggregateGreeks(legs),
        meta: {
          put_short_strike: putShort.instrument.strike,
          put_long_strike: putLong.instrument.strike,
          call_short_strike: callShort.instrument.strike,
          call_long_strike: callLong.instrument.strike,
          put_width_usd: putWidth,
          call_width_usd: callWidth,
        },
      };
      trades.push({ ...base, score: round(scoreTrade(base, deltaCenter), 3) });
    }
  }

  trades.sort((a, b) => b.score - a.score);
  return { spot, trades: trades.slice(0, cfg.top_n), stats: { total: puts.length + calls.length, filtered: totalCandidates } };
}
