import { runStrategy } from "@/lib/strategies/registry";
import type { ScreenedTrade, StrategyId } from "@/lib/strategies/types";
import {
  HORIZONS,
  HORIZON_ORDER,
  type AgentSide,
  type HorizonId,
  type HorizonMeta,
} from "./horizons";
import { rescoreForHorizon, type ScoredPick } from "./scorer";

export interface HorizonReport {
  id: HorizonId;
  label: string;
  subtitle: string;
  dte_min: number;
  dte_max: number;
  side: AgentSide;
  picks: ScoredPick[];
  stats: {
    naked_candidates: number;
    spread_candidates: number;
    total_considered: number;
  };
  verdict: {
    tone: "go" | "neutral" | "wait";
    headline: string;
    bullets: string[];
  };
}

export interface AgentsReport {
  side: AgentSide;
  spot: number;
  generated_at: string;
  horizons: HorizonReport[];
}

interface SideStrategies {
  naked: StrategyId;
  spread: StrategyId;
  nakedLabel: string;
  spreadLabel: string;
  cfg(h: HorizonMeta): { naked: HorizonMeta["sellPut"]; spread: HorizonMeta["bullPutSpread"] };
}

const STRATEGIES_BY_SIDE: Record<AgentSide, SideStrategies> = {
  put: {
    naked: "sell-put",
    spread: "bull-put-spread",
    nakedLabel: "Sell PUT",
    spreadLabel: "Bull Put",
    cfg: (h) => ({ naked: h.sellPut, spread: h.bullPutSpread }),
  },
  call: {
    naked: "sell-call",
    spread: "bear-call-spread",
    nakedLabel: "Sell CALL",
    spreadLabel: "Bear Call",
    cfg: (h) => ({ naked: h.sellCall, spread: h.bearCallSpread }),
  },
};

function describeTrade(p: ScoredPick, sc: SideStrategies): string {
  const shortLeg = p.legs.find((l) => l.direction === "sell");
  const strike = shortLeg?.strike ?? 0;
  if (p.strategy === sc.spread) {
    const longLeg = p.legs.find((l) => l.direction === "buy");
    return `${strike}/${longLeg?.strike ?? "?"} ${p.dte}d`;
  }
  return `${strike} ${p.dte}d`;
}

function buildVerdict(
  picks: ScoredPick[],
  h: HorizonMeta,
  sc: SideStrategies,
  side: AgentSide
): HorizonReport["verdict"] {
  const nakedCfg = sc.cfg(h).naked;
  if (picks.length === 0) {
    return {
      tone: "wait",
      headline: "Sem candidato no filtro",
      bullets: [
        `Nenhum trade dentro de delta ${nakedCfg.short_delta_min}–${nakedCfg.short_delta_max}, IV ≥ ${nakedCfg.iv_min}%, DTE ${h.dte_min}–${h.dte_max}d`,
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

  const topKind = top.strategy === sc.naked ? sc.nakedLabel : sc.spreadLabel;
  const bullets: string[] = [];
  bullets.push(
    `Melhor: ${topKind} ${describeTrade(top, sc)} · ROI ${top.roi_annual_pct?.toFixed(0) ?? "—"}% · POP ${(top.pop * 100).toFixed(0)}%`
  );
  bullets.push(`Média Top: ROI ${avgRoi.toFixed(0)}% a.a. · POP ${(avgPop * 100).toFixed(0)}%`);
  if (anyIvLow) bullets.push(`IV baixo pra esse horizonte (< ${h.iv_threshold_warn}%) — prêmio menor`);
  if (top.warnings.length > 0) bullets.push(`Atenção: ${top.warnings[0]}`);
  if (side === "call") {
    bullets.push("Viés bearish — naked tem risco upside ilimitado, prefira spread se bias incerto");
  }

  const headline =
    tone === "go"
      ? "Janela favorável — prêmio e POP alinhados"
      : tone === "wait"
      ? "Aguardar melhor janela (IV / ROI baixo)"
      : "Ok com ressalvas — ver detalhes";

  return { tone, headline, bullets };
}

async function runHorizon(
  h: HorizonMeta,
  side: AgentSide
): Promise<{ report: HorizonReport; spot: number }> {
  const sc = STRATEGIES_BY_SIDE[side];
  const { naked: nakedCfg, spread: spreadCfg } = sc.cfg(h);

  const [naked, spread] = await Promise.all([
    runStrategy(sc.naked, nakedCfg),
    runStrategy(sc.spread, spreadCfg),
  ]);

  const spot = naked.spot || spread.spot;
  const all: ScreenedTrade[] = [...naked.trades, ...spread.trades];
  const rescored = all.map((t) => rescoreForHorizon(t, h, spot));
  rescored.sort((a, b) => b.horizon_score - a.horizon_score);

  const top3: ScoredPick[] = [];
  const byNaked = rescored.filter((p) => p.strategy === sc.naked);
  const bySpread = rescored.filter((p) => p.strategy === sc.spread);
  if (byNaked[0]) top3.push(byNaked[0]);
  if (bySpread[0]) top3.push(bySpread[0]);
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
    side,
    picks: top3,
    stats: {
      naked_candidates: naked.stats.filtered,
      spread_candidates: spread.stats.filtered,
      total_considered: all.length,
    },
    verdict: buildVerdict(top3, h, sc, side),
  };
  return { report, spot };
}

const cache: Record<AgentSide, { at: number; report: AgentsReport } | null> = {
  put: null,
  call: null,
};
const TTL_MS = 60_000;

export async function runAgents(side: AgentSide = "put", force = false): Promise<AgentsReport> {
  const c = cache[side];
  if (!force && c && Date.now() - c.at < TTL_MS) return c.report;

  const runs = await Promise.all(HORIZON_ORDER.map((id) => runHorizon(HORIZONS[id], side)));
  const spot = runs.find((r) => r.spot > 0)?.spot ?? 0;

  const report: AgentsReport = {
    side,
    spot,
    generated_at: new Date().toISOString(),
    horizons: runs.map((r) => r.report),
  };
  cache[side] = { at: Date.now(), report };
  return report;
}

export function invalidateAgentsCache(side?: AgentSide): void {
  if (side) cache[side] = null;
  else {
    cache.put = null;
    cache.call = null;
  }
}
