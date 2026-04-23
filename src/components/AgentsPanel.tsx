"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoButton } from "./InfoButton";
import type { ScreenedTrade } from "@/lib/strategies/types";

type HorizonId = "short" | "medium" | "long";
type Side = "put" | "call";

interface Pick extends ScreenedTrade {
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

interface Verdict {
  tone: "go" | "neutral" | "wait";
  headline: string;
  bullets: string[];
}

interface HorizonReport {
  id: HorizonId;
  label: string;
  subtitle: string;
  dte_min: number;
  dte_max: number;
  side: Side;
  picks: Pick[];
  stats: {
    naked_candidates: number;
    spread_candidates: number;
    total_considered: number;
  };
  verdict: Verdict;
}

interface AgentsData {
  side: Side;
  spot: number;
  generated_at: string;
  horizons: HorizonReport[];
  error?: string;
}

interface Explanation {
  bullets: string[];
  go_no_go: "go" | "neutral" | "wait";
  one_liner: string;
  model: string;
}

type ExplainState = Record<HorizonId, { loading: boolean; data?: Explanation; error?: string }>;

const TONE_STYLES: Record<Verdict["tone"], { chip: string; label: string }> = {
  go: { chip: "text-[var(--color-success)] border-[rgba(52,211,153,0.4)] bg-[var(--color-success-soft)]", label: "OK pra operar" },
  neutral: { chip: "text-[var(--color-warning)] border-[rgba(251,191,36,0.4)] bg-[var(--color-warning)]/10", label: "Ok com ressalvas" },
  wait: { chip: "text-[var(--color-danger)] border-[rgba(248,113,113,0.4)] bg-[var(--color-danger-soft)]", label: "Aguardar" },
};

function describePick(p: Pick): { label: string; kind: string } {
  const short = p.legs.find((l) => l.direction === "sell");
  const long = p.legs.find((l) => l.direction === "buy");
  switch (p.strategy) {
    case "bull-put-spread":
      return { kind: "Bull Put", label: `${short?.strike}/${long?.strike ?? "?"}` };
    case "bear-call-spread":
      return { kind: "Bear Call", label: `${short?.strike}/${long?.strike ?? "?"}` };
    case "sell-call":
      return { kind: "Sell CALL", label: `${short?.strike}` };
    case "sell-put":
    default:
      return { kind: "Sell PUT", label: `${short?.strike}` };
  }
}

const SIDE_META: Record<Side, {
  title: string;
  subtitle: string;
  biasChip: string;
  biasLabel: string;
  infoTitle: string;
  infoBullets: Array<{ bold: string; rest: string }>;
}> = {
  put: {
    title: "Agentes de oportunidade PUT · bullish",
    subtitle: "sell-put naked + bull-put-spread · 3 horizontes",
    biasChip: "text-[var(--color-success)] border-[rgba(52,211,153,0.4)] bg-[var(--color-success-soft)]",
    biasLabel: "Bullish",
    infoTitle: "Como os agentes PUT pensam",
    infoBullets: [
      { bold: "Curto (1–5d)", rest: ": theta agressivo, Δ 0.25–0.35, IV ≥ 35%. Gamma alto, exige vigilância diária." },
      { bold: "Médio (5–10d)", rest: ": equilíbrio prêmio × POP, Δ 0.15–0.25, IV ≥ 30%. Sweet spot de renda." },
      { bold: "Longo (10–30d)", rest: ": segurança, Δ 0.10–0.20, POP alto. Ganha em contango." },
      { bold: "Explicar", rest: ": LLM cruza macro + OI walls + skew e devolve go/neutral/wait." },
    ],
  },
  call: {
    title: "Agentes de oportunidade CALL · bearish",
    subtitle: "sell-call naked + bear-call-spread · 3 horizontes",
    biasChip: "text-[var(--color-danger)] border-[rgba(248,113,113,0.4)] bg-[var(--color-danger-soft)]",
    biasLabel: "Bearish",
    infoTitle: "Como os agentes CALL pensam",
    infoBullets: [
      { bold: "Curto (1–5d)", rest: ": theta rico acima do spot, Δ 0.25–0.35, IV ≥ 35%. Rally forte é inimigo." },
      { bold: "Médio (5–10d)", rest: ": Δ 0.15–0.25. Boa combinação com CALL wall forte como teto técnico." },
      { bold: "Longo (10–30d)", rest: ": Δ 0.10–0.20, foco em segurança. Backwardation ajuda." },
      { bold: "Risco naked", rest: ": upside infinito — se bias for incerto, sempre prefira bear-call-spread." },
      { bold: "Explicar", rest: ": LLM avalia macro (ETF flows, funding) + OI walls com picks." },
    ],
  },
};

interface AgentsPanelProps {
  side?: Side;
}

export function AgentsPanel({ side = "put" }: AgentsPanelProps) {
  const [data, setData] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explain, setExplain] = useState<ExplainState>({
    short: { loading: false },
    medium: { loading: false },
    long: { loading: false },
  });

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ side });
      if (force) params.set("force", "1");
      const res = await fetch(`/api/agents?${params.toString()}`);
      const json = (await res.json()) as AgentsData;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar agentes");
    } finally {
      setLoading(false);
    }
  }, [side]);

  useEffect(() => {
    load();
  }, [load]);

  async function askExplain(h: HorizonId) {
    setExplain((prev) => ({ ...prev, [h]: { loading: true } }));
    try {
      const res = await fetch("/api/agents/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon: h, side }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setExplain((prev) => ({ ...prev, [h]: { loading: false, data: json.explanation } }));
    } catch (err) {
      setExplain((prev) => ({
        ...prev,
        [h]: { loading: false, error: err instanceof Error ? err.message : "Erro" },
      }));
    }
  }

  const meta = SIDE_META[side];

  if (error) {
    return (
      <div className="card p-3 text-xs text-[var(--color-danger)]">
        Agentes {side.toUpperCase()}: {error}
      </div>
    );
  }
  if (!data && loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Rodando agentes {side.toUpperCase()} (curto · médio · longo)…
      </div>
    );
  }
  if (!data) return null;

  return (
    <section className="card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">{meta.title}</h2>
              <span
                className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${meta.biasChip}`}
              >
                {meta.biasLabel}
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{meta.subtitle}</p>
          </div>
          <InfoButton
            title={meta.infoTitle}
            summary={
              <ul className="list-disc pl-4 space-y-1">
                {meta.infoBullets.map((b, i) => (
                  <li key={i}>
                    <strong>{b.bold}</strong>
                    {b.rest}
                  </li>
                ))}
              </ul>
            }
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] tabular font-mono">
          <span>BTC ${data.spot.toLocaleString()}</span>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="btn btn-ghost text-[11px]"
            title="Recomputa ignorando cache"
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {data.horizons.map((h) => {
          const tone = TONE_STYLES[h.verdict.tone];
          const exp = explain[h.id];
          return (
            <div key={h.id} className="card-muted p-3 space-y-3 flex flex-col">
              <header className="space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-subtle)] font-semibold">
                      {h.label}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-muted)]">{h.subtitle}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider ${tone.chip}`}
                  >
                    {tone.label}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--color-text)] font-semibold">
                  {h.verdict.headline}
                </div>
              </header>

              <ul className="text-[10.5px] text-[var(--color-text-muted)] space-y-0.5 list-disc pl-4">
                {h.verdict.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>

              {h.picks.length > 0 ? (
                <div className="space-y-1.5">
                  {h.picks.map((p, i) => {
                    const d = describePick(p);
                    const shortLeg = p.legs.find((l) => l.direction === "sell");
                    return (
                      <div
                        key={`${p.strategy}-${p.expiration_timestamp}-${i}`}
                        className="border border-[var(--color-border)] rounded-md p-2 text-[10.5px] font-mono tabular space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--color-text)]">
                            #{i + 1} {d.kind} {d.label}
                          </span>
                          <span className="text-[var(--color-accent)]">
                            score {p.horizon_score}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-muted)] flex-wrap">
                          <span>DTE {p.dte}d</span>
                          <span>
                            Δ {shortLeg ? Math.abs(shortLeg.delta).toFixed(2) : "—"}
                          </span>
                          <span>IV {shortLeg?.mark_iv?.toFixed(0) ?? "—"}%</span>
                          <span>POP {(p.pop * 100).toFixed(0)}%</span>
                          <span className="text-[var(--color-success)]">
                            ROI {p.roi_annual_pct?.toFixed(0) ?? "—"}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-[var(--color-text-subtle)]">
                          <span>
                            crédito ${p.credit_usd} · max loss{" "}
                            {p.max_loss_usd === null ? "∞" : `$${p.max_loss_usd}`}
                          </span>
                        </div>
                        {p.warnings.length > 0 && (
                          <div className="text-[9.5px] text-[var(--color-warning)] leading-tight">
                            ⚠ {p.warnings.join(" · ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-[10.5px] text-[var(--color-text-muted)] italic py-2">
                  Nenhum candidato elegível no momento.
                </div>
              )}

              <div className="mt-auto pt-2 border-t border-[var(--color-border)] space-y-2">
                {exp.data && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span
                        className={`px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider ${
                          TONE_STYLES[exp.data.go_no_go].chip
                        }`}
                      >
                        LLM: {exp.data.go_no_go}
                      </span>
                      <span className="text-[var(--color-text-subtle)] font-mono">
                        {exp.data.model}
                      </span>
                    </div>
                    {exp.data.one_liner && (
                      <div className="text-[11px] text-[var(--color-text)] font-semibold italic">
                        “{exp.data.one_liner}”
                      </div>
                    )}
                    <ul className="text-[10.5px] text-[var(--color-text-muted)] list-disc pl-4 space-y-0.5">
                      {exp.data.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {exp.error && (
                  <div className="text-[10px] text-[var(--color-danger)] leading-tight">
                    {exp.error}
                  </div>
                )}
                <button
                  onClick={() => askExplain(h.id)}
                  disabled={exp.loading || h.picks.length === 0}
                  className="btn btn-ghost w-full text-[11px]"
                  title="Chama LLM cruzando macro + OI + vol + picks"
                >
                  {exp.loading
                    ? "Analisando…"
                    : exp.data
                    ? "Reanalisar com LLM"
                    : "Explicar com LLM"}
                </button>
                <div className="text-[9.5px] text-[var(--color-text-subtle)] text-center">
                  {h.stats.naked_candidates + h.stats.spread_candidates} candidatos avaliados
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-[var(--color-text-muted)] text-right">
        {new Date(data.generated_at).toLocaleTimeString("pt-BR")}
      </div>
    </section>
  );
}
