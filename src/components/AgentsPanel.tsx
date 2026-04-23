"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoButton } from "./InfoButton";
import type { ScreenedTrade } from "@/lib/strategies/types";

type HorizonId = "short" | "medium" | "long";

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
  picks: Pick[];
  stats: {
    sell_put_candidates: number;
    bull_put_spread_candidates: number;
    total_considered: number;
  };
  verdict: Verdict;
}

interface AgentsData {
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
  if (p.strategy === "bull-put-spread") {
    return { kind: "Bull Put", label: `${short?.strike}/${long?.strike ?? "?"}` };
  }
  return { kind: "Sell PUT", label: `${short?.strike}` };
}

export function AgentsPanel() {
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
      const res = await fetch(`/api/agents${force ? "?force=1" : ""}`);
      const json = (await res.json()) as AgentsData;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar agentes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function askExplain(h: HorizonId) {
    setExplain((prev) => ({ ...prev, [h]: { loading: true } }));
    try {
      const res = await fetch("/api/agents/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horizon: h }),
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

  if (error) {
    return <div className="card p-3 text-xs text-[var(--color-danger)]">Agentes: {error}</div>;
  }
  if (!data && loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Rodando agentes (curto · médio · longo)…
      </div>
    );
  }
  if (!data) return null;

  return (
    <section className="card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Agentes de oportunidade · sell PUT / bull put spread
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Três horizontes temporais · score algorítmico por perfil · explicação LLM sob demanda
            </p>
          </div>
          <InfoButton
            title="Como os agentes pensam"
            summary={
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Curto (1–5d)</strong>: theta agressivo, Δ 0.25–0.35, IV ≥ 35%. Cada
                  dia conta; gamma alto exige vigilância.
                </li>
                <li>
                  <strong>Médio (5–10d)</strong>: equilíbrio prêmio × POP, Δ 0.15–0.25, IV ≥ 30%.
                  Sweet spot clássico de renda.
                </li>
                <li>
                  <strong>Longo (10–30d)</strong>: foco em segurança, Δ 0.10–0.20, POP alto.
                  Ganha em contango; prêmio por dia menor.
                </li>
                <li>
                  Score combina ROI anual, POP, aderência ao delta alvo, theta/dte e IV fit.
                  Mostra Top 3 por horizonte (≥1 naked e ≥1 spread quando possível).
                </li>
                <li>
                  <strong>Explicar</strong> chama LLM cruzando macro (funding, DXY, US10Y, ETF) +
                  OI walls + skew com os picks, e devolve go/neutral/wait acionável.
                </li>
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
                  {h.stats.sell_put_candidates + h.stats.bull_put_spread_candidates} candidatos
                  avaliados
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
