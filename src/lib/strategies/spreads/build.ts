import type { OptionType } from "@/lib/deribit/types";
import type { EnrichedQuote, ScreenedTrade, StrategyConfig, StrategyId } from "../types";
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
 * Para cada short candidato (delta no range short), procura long leg de
 * proteção do mesmo vencimento, mais OTM (delta menor), respeitando largura
 * mínima/máxima do spread.
 *
 * - bull-put: short put strike > long put strike (long mais OTM = mais distante para baixo)
 * - bear-call: short call strike < long call strike (long mais OTM = mais distante para cima)
 */
export async function screenCreditSpread(
  strategy: "bull-put-spread" | "bear-call-spread",
  cfg: StrategyConfig
): Promise<{ spot: number; trades: ScreenedTrade[]; stats: { total: number; filtered: number } }> {
  const { spot, quotes } = await loadBook(cfg.dte_min, cfg.dte_max);
  const optionType: OptionType = strategy === "bull-put-spread" ? "put" : "call";
  const sameType = filterByType(quotes, optionType);

  const longDeltaMin = cfg.long_delta_min ?? 0.05;
  const longDeltaMax = cfg.long_delta_max ?? cfg.short_delta_min - 0.01;
  const widthMin = cfg.spread_width_min_usd ?? 1000;
  const widthMax = cfg.spread_width_max_usd ?? 5000;

  // Agrupa por vencimento — só faz sentido casar pernas no mesmo expiry
  const byExpiry = groupByExpiry(sameType);

  const trades: ScreenedTrade[] = [];
  const deltaCenter = (cfg.short_delta_min + cfg.short_delta_max) / 2;
  let totalShortCandidates = 0;

  for (const [, expiryQuotes] of byExpiry) {
    const shorts = expiryQuotes.filter((q) => {
      const d = Math.abs(q.ticker.greeks?.delta ?? 0);
      if (d < cfg.short_delta_min || d > cfg.short_delta_max) return false;
      if ((q.ticker.mark_iv ?? 0) < cfg.iv_min) return false;
      if ((q.ticker.open_interest ?? 0) < cfg.min_open_interest) return false;
      if (q.price < cfg.min_short_price) return false;
      return true;
    });
    totalShortCandidates += shorts.length;

    const longs = expiryQuotes.filter((q) => {
      const d = Math.abs(q.ticker.greeks?.delta ?? 0);
      return d >= longDeltaMin && d <= longDeltaMax;
    });

    for (const shortQ of shorts) {
      const candidates = longs.filter((longQ) => {
        // proteção mais OTM do que a short:
        // bull-put → long put strike < short put strike
        // bear-call → long call strike > short call strike
        const isOtmFurther =
          strategy === "bull-put-spread"
            ? longQ.instrument.strike < shortQ.instrument.strike
            : longQ.instrument.strike > shortQ.instrument.strike;
        if (!isOtmFurther) return false;
        const width = Math.abs(shortQ.instrument.strike - longQ.instrument.strike);
        return width >= widthMin && width <= widthMax;
      });

      // Escolhe a long que maximiza crédito líquido com largura razoável
      let bestPair: { long: EnrichedQuote; netCredit: number } | null = null;
      for (const longQ of candidates) {
        const net = shortQ.price - longQ.price; // crédito líquido em BTC
        if (net <= 0) continue;
        if (!bestPair || net > bestPair.netCredit) bestPair = { long: longQ, netCredit: net };
      }
      if (!bestPair) continue;

      const shortLeg = quoteToLeg(shortQ, "sell");
      const longLeg = quoteToLeg(bestPair.long, "buy");
      const legs = [shortLeg, longLeg];

      const credit = creditBtc(legs);
      const creditUsd = credit * spot;
      const maxLoss = maxLossUsd(strategy, legs, creditUsd);
      const margin = marginEstimateBtc(strategy, legs, maxLoss, spot) ?? 1;
      const marginUsd = margin * spot;
      const width = Math.abs(shortLeg.strike - longLeg.strike);

      const base = {
        strategy: strategy as StrategyId,
        legs,
        expiration_timestamp: shortQ.instrument.expiration_timestamp,
        dte: round(shortQ.dte, 1),
        credit_btc: round(credit, 6),
        credit_usd: round(creditUsd, 2),
        max_loss_usd: maxLoss !== null ? round(maxLoss, 2) : null,
        breakeven_usd: breakevenUsd(strategy, legs, creditUsd).map((v) => round(v, 2)),
        pop: round(popFromLegs(legs), 3),
        roi_annual_pct: roiAnnualPct(creditUsd, marginUsd, shortQ.dte),
        risk_reward: maxLoss !== null && creditUsd > 0 ? round(maxLoss / creditUsd, 2) : null,
        greeks: aggregateGreeks(legs),
        meta: {
          short_strike: shortLeg.strike,
          long_strike: longLeg.strike,
          width_usd: width,
        },
      };
      trades.push({ ...base, score: round(scoreTrade(base, deltaCenter), 3) });
    }
  }

  trades.sort((a, b) => b.score - a.score);
  return { spot, trades: trades.slice(0, cfg.top_n), stats: { total: sameType.length, filtered: totalShortCandidates } };
}
