import { runStrategy } from "@/lib/strategies/registry";
import type { ScreenedTrade } from "@/lib/strategies/types";
import { HORIZONS, HORIZON_ORDER, type HorizonId, type HorizonMeta } from "./horizons";
import { rescoreForHorizon, type ScoredPick } from "./scorer";

export interface HorizonReport {
  id: HorizonId;
  label: string;
  subtitle: string;
  dte_min: number;
  dte_max: number;
  picks: ScoredPick[];
  stats: {
    sell_put_candidates: number;
    bull_put_spread_candidates: number;
    total_considered: number;
  };
  /** Recomendação sintética do agente (sem LLM) — baseada nos melhores picks. */
  verdict: {
    tone: "go" | "neutral" | "wait";
    headline: string;
    bullets: string[];
  };
}

export interface AgentsReport {
  spot: number;
  generated_at: string;
  horizons: HorizonReport[];
}

function describeTrade(p: ScoredPick): string {
  const shortLeg = p.legs.find((l) => l.direction === "sell");
  const strike = shortLeg?.strike ?? 0;
  if (p.strategy === "bull-put-spread") {
    const longLeg = p.legs.find((l) => l.direction === "buy");
    return `${strike}/${longLeg?.strike ?? "?"} ${p.dte}d`;
  }
  return `${strike} ${p.dte}d`;
}

function buildVerdict(picks: ScoredPick[], h: HorizonMeta): HorizonReport["verdict"] {
  if (picks.length === 0) {
    return {
      tone: "wait",
      headline: "Sem candidato no filtro",
      bullets: [
        `Nenhum trade dentro de delta ${h.sellPut.short_delta_min}–${h.sellPut.short_delta_max}, IV ≥ ${h.sellPut.iv_min}%, DTE ${h.dte_min}–${h.dte_max}d`,
        "Relaxar filtros ou aguardar IV subir",
      ],
    };
  }
  const top = picks[0];
  const avgPop = picks.reduce((s, p) => s + p.pop, 0) / picks.length;
  const avgRoi = picks.reduce((s, p) => s + (p.roi_annual_pct ?? 0), 0) / picks.length;
  const anyIvLow = picks.every((p) => {
    const leg = p.legs.find((l) => l.direction === "sell");
    return (leg?.mark_iv ?? 0) < h.iv_threshold_warn;
  });

  let tone: "go" | "neutral" | "wait" = "neutral";
  if (top.horizon_score >= 0.55 && avgPop >= 0.7 && !anyIvLow) tone = "go";
  else if (anyIvLow || avgRoi < 30) tone = "wait";

  const bullets: string[] = [];
  bullets.push(
    `Melhor: ${top.strategy === "sell-put" ? "Sell PUT" : "Bull Put"} ${describeTrade(top)} · ROI ${top.roi_annual_pct?.toFixed(0) ?? "—"}% · POP ${(top.pop * 100).toFixed(0)}%`
  );
  bullets.push(`Média Top: ROI ${avgRoi.toFixed(0)}% a.a. · POP ${(avgPop * 100).toFixed(0)}%`);
  if (anyIvLow) bullets.push(`IV baixo pra esse horizonte (< ${h.iv_threshold_warn}%) — prêmio menor`);
  if (top.warnings.length > 0) bullets.push(`Atenção: ${top.warnings[0]}`);

  const headline =
    tone === "go"
      ? "Janela favorável — prêmio e POP alinhados"
      : tone === "wait"
      ? "Aguardar melhor janela (IV / ROI baixo)"
      : "Ok com ressalvas — ver detalhes";

  return { tone, headline, bullets };
}

async function runHorizon(h: HorizonMeta): Promise<{ report: HorizonReport; spot: number }> {
  const [sellPut, bullPut] = await Promise.all([
    runStrategy("sell-put", h.sellPut),
    runStrategy("bull-put-spread", h.bullPutSpread),
  ]);

  const spot = sellPut.spot || bullPut.spot;
  const all: ScreenedTrade[] = [...sellPut.trades, ...bullPut.trades];
  const rescored = all.map((t) => rescoreForHorizon(t, h, spot));
  rescored.sort((a, b) => b.horizon_score - a.horizon_score);

  const top3: ScoredPick[] = [];
  const bySp = rescored.filter((p) => p.strategy === "sell-put");
  const byBp = rescored.filter((p) => p.strategy === "bull-put-spread");
  if (bySp[0]) top3.push(bySp[0]);
  if (byBp[0]) top3.push(byBp[0]);
  for (const p of rescored) {
    if (top3.length >= 3) break;
    if (!top3.includes(p)) top3.push(p);
  }

  const report: HorizonReport = {
    id: h.id,
    label: h.label,
    subtitle: h.subtitle,
    dte_min: h.dte_min,
    dte_max: h.dte_max,
    picks: top3,
    stats: {
      sell_put_candidates: sellPut.stats.filtered,
      bull_put_spread_candidates: bullPut.stats.filtered,
      total_considered: all.length,
    },
    verdict: buildVerdict(top3, h),
  };
  return { report, spot };
}

let cache: { at: number; report: AgentsReport } | null = null;
const TTL_MS = 60_000;

export async function runAgents(force = false): Promise<AgentsReport> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.report;

  const runs = await Promise.all(HORIZON_ORDER.map((id) => runHorizon(HORIZONS[id])));
  const spot = runs.find((r) => r.spot > 0)?.spot ?? 0;

  const report: AgentsReport = {
    spot,
    generated_at: new Date().toISOString(),
    horizons: runs.map((r) => r.report),
  };
  cache = { at: Date.now(), report };
  return report;
}

export function invalidateAgentsCache(): void {
  cache = null;
}
