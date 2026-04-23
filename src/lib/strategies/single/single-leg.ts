import type { OptionType } from "@/lib/deribit/types";
import type { ScreenedTrade, StrategyConfig, StrategyId } from "../types";
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
import { filterByType, loadBook, quoteToLeg } from "../book";

export type SingleLegStrategy = Extract<StrategyId, "sell-put" | "sell-call">;
const TYPE_OF: Record<SingleLegStrategy, OptionType> = {
  "sell-put": "put",
  "sell-call": "call",
};

export async function screenSingleLeg(
  strategy: SingleLegStrategy,
  cfg: StrategyConfig
): Promise<{ spot: number; trades: ScreenedTrade[]; stats: { total: number; filtered: number } }> {
  const { spot, quotes } = await loadBook(cfg.dte_min, cfg.dte_max);
  const sameType = filterByType(quotes, TYPE_OF[strategy]);

  const candidates = sameType.filter((q) => {
    const d = Math.abs(q.ticker.greeks?.delta ?? 0);
    if (d < cfg.short_delta_min || d > cfg.short_delta_max) return false;
    if ((q.ticker.mark_iv ?? 0) < cfg.iv_min) return false;
    if ((q.ticker.open_interest ?? 0) < cfg.min_open_interest) return false;
    if (q.price < cfg.min_short_price) return false;
    return true;
  });

  const deltaCenter = (cfg.short_delta_min + cfg.short_delta_max) / 2;
  const trades: ScreenedTrade[] = [];

  for (const q of candidates) {
    const leg = quoteToLeg(q, "sell");
    const credit = creditBtc([leg]);
    const creditUsd = credit * spot;
    const maxLoss = maxLossUsd(strategy, [leg], creditUsd);
    const margin = marginEstimateBtc(strategy, [leg], maxLoss, spot) ?? 1;
    const marginUsd = margin * spot;

    const base = {
      strategy,
      legs: [leg],
      expiration_timestamp: q.instrument.expiration_timestamp,
      dte: round(q.dte, 1),
      credit_btc: round(credit, 6),
      credit_usd: round(creditUsd, 2),
      max_loss_usd: maxLoss !== null ? round(maxLoss, 2) : null,
      breakeven_usd: breakevenUsd(strategy, [leg], creditUsd).map((v) => round(v, 2)),
      pop: round(popFromLegs([leg]), 3),
      roi_annual_pct: roiAnnualPct(creditUsd, marginUsd, q.dte),
      risk_reward: maxLoss !== null && creditUsd > 0 ? round(maxLoss / creditUsd, 2) : null,
      greeks: aggregateGreeks([leg]),
      meta: {
        short_strike: q.instrument.strike,
        otm_pct: round(Math.abs((q.instrument.strike - spot) / spot) * 100, 2),
      },
    };
    trades.push({ ...base, score: round(scoreTrade(base, deltaCenter), 3) });
  }

  trades.sort((a, b) => b.score - a.score);
  return { spot, trades: trades.slice(0, cfg.top_n), stats: { total: sameType.length, filtered: candidates.length } };
}
