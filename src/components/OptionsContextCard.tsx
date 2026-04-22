"use client";

import { useState, useEffect } from "react";
import type { TvOptionsContext, MarketRegime, DirectionalBias } from "@/app/api/tv-analysis/route";
import type { DvolResult } from "@/lib/deribit/client";
import type { BtcBiasResult } from "@/app/api/btc-bias/route";

const REGIME_CFG: Record<MarketRegime, { label: string; chip: string; color: string }> = {
  RANGING:  { label: "Lateral",    chip: "chip-success", color: "var(--color-success)" },
  TRENDING: { label: "Tendência",  chip: "chip-warning", color: "var(--color-warning)" },
  BREAKOUT: { label: "Rompimento", chip: "chip-danger",  color: "var(--color-danger)" },
};

const BIAS_CFG: Record<DirectionalBias, { label: string; color: string; chip: string }> = {
  BULLISH: { label: "Altista",  color: "var(--color-success)", chip: "chip-success" },
  BEARISH: { label: "Baixista", color: "var(--color-danger)",  chip: "chip-danger" },
  NEUTRAL: { label: "Neutro",   color: "var(--color-warning)", chip: "chip-warning" },
};

const BIAS_ACTION: Record<DirectionalBias, string> = {
  BULLISH: "Vender PUT OTM",
  BEARISH: "Vender CALL OTM",
  NEUTRAL: "Iron Condor",
};

function ivRankColor(rank: number): string {
  if (rank >= 50) return "var(--color-success)";
  if (rank >= 30) return "var(--color-warning)";
  return "var(--color-danger)";
}

function ivRankLabel(rank: number): string {
  if (rank >= 50) return "Vender premium";
  if (rank >= 30) return "IV moderada";
  return "IV baixa · aguardar";
}

function ivRankChip(rank: number): string {
  if (rank >= 50) return "chip-success";
  if (rank >= 30) return "chip-warning";
  return "chip-danger";
}

function BiasCell({ label, bias, sub }: { label: string; bias: DirectionalBias; sub?: string }) {
  const cfg = BIAS_CFG[bias];
  return (
    <div className="card-muted p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="eyebrow">{label}</div>
        <span className={`chip ${cfg.chip}`}>{cfg.label.toUpperCase()}</span>
      </div>
      <div className="text-sm font-medium" style={{ color: cfg.color }}>
        {BIAS_ACTION[bias]}
      </div>
      {sub && <div className="text-xs text-[var(--color-text-subtle)] font-mono tabular">{sub}</div>}
    </div>
  );
}

function RsiBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const pct = Math.min(100, Math.max(0, value));
  const color = value > 70 ? "var(--color-danger)" : value < 30 ? "var(--color-success)" : "var(--color-info)";
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-14 text-[11px] text-[var(--color-text-subtle)] font-medium">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-10 text-xs text-right font-mono tabular" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  );
}

export function OptionsContextCard() {
  const [tv, setTv] = useState<TvOptionsContext | null>(null);
  const [dvol, setDvol] = useState<DvolResult | null>(null);
  const [bias, setBias] = useState<BtcBiasResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    try {
      const [tvRes, dvolRes, biasRes] = await Promise.all([
        fetch("/api/tv-analysis"),
        fetch("/api/dvol"),
        fetch("/api/btc-bias"),
      ]);
      const [tvJson, dvolJson, biasJson] = await Promise.all([tvRes.json(), dvolRes.json(), biasRes.json()]);
      if (tvJson.error) throw new Error(`TV: ${tvJson.error}`);
      if (biasJson.error) throw new Error(`Viés: ${biasJson.error}`);
      setTv(tvJson);
      setBias(biasJson);
      if (!dvolJson.error) setDvol(dvolJson);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar contexto");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="card p-5 space-y-4">
        <div className="skeleton h-4 w-48" />
        <div className="grid grid-cols-3 gap-3">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
      </div>
    );
  }

  if (error && !tv) {
    return (
      <div className="card p-4 text-sm text-[var(--color-danger)]">{error}</div>
    );
  }

  const regime = tv ? REGIME_CFG[tv.regime_1h] : null;

  const allBullish = bias?.bias_4h === "BULLISH" && bias?.bias_daily === "BULLISH";
  const allBearish = bias?.bias_4h === "BEARISH" && bias?.bias_daily === "BEARISH";
  const dirSuggestion = allBullish
    ? "Vender PUTs OTM · mercado acima do strike = lucro máximo"
    : allBearish
    ? "Vender CALLs OTM · mercado abaixo do strike = lucro máximo"
    : "Vender PUTs + CALLs OTM (Iron Condor) · ou aguardar alinhamento";

  return (
    <section className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Contexto BTC · Opções</p>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-0.5">
            Visão macro para escolha de estratégia
          </h3>
        </div>
        {bias && (
          <div className="flex items-center gap-4 text-xs font-mono tabular">
            <span className="text-[var(--color-text)] text-base font-semibold">
              ${bias.close.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[var(--color-text-subtle)]">
              SMA20{" "}
              <span style={{ color: bias.close > bias.sma20 ? "var(--color-success)" : "var(--color-danger)" }}>
                {bias.sma20.toFixed(0)}
              </span>
              <span className="mx-1.5">·</span>
              SMA50{" "}
              <span style={{ color: bias.close > bias.sma50 ? "var(--color-success)" : "var(--color-danger)" }}>
                {bias.sma50.toFixed(0)}
              </span>
            </span>
            {tv && (
              <span className="text-[var(--color-text-subtle)]">
                {new Date(tv.fetched_at).toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* IV Rank */}
      {dvol && (
        <div className="card-muted p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">DVOL · IV Rank 52 semanas</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Gate Lee Lowell para vender premium</p>
            </div>
            <span className={`chip ${ivRankChip(dvol.iv_rank)}`}>{ivRankLabel(dvol.iv_rank)}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-subtle)] font-mono tabular w-12">{dvol.min_52w.toFixed(0)}</span>
            <div className="flex-1 h-2.5 rounded-full relative bg-[var(--color-bg)] overflow-visible">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${dvol.iv_rank}%`,
                  background: `linear-gradient(90deg, rgba(96,165,250,0.4), ${ivRankColor(dvol.iv_rank)})`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 shadow-lg transition-all duration-700"
                style={{
                  left: `calc(${dvol.iv_rank}% - 6px)`,
                  background: ivRankColor(dvol.iv_rank),
                  borderColor: "var(--color-bg)",
                  boxShadow: `0 0 12px ${ivRankColor(dvol.iv_rank)}`,
                }}
              />
            </div>
            <span className="text-xs text-[var(--color-text-subtle)] font-mono tabular w-12 text-right">{dvol.max_52w.toFixed(0)}</span>
          </div>

          <div className="grid grid-cols-4 gap-3 pt-1">
            <Metric label="DVOL atual" value={dvol.current.toFixed(1)} color={ivRankColor(dvol.iv_rank)} />
            <Metric label="IV Rank" value={`${dvol.iv_rank.toFixed(1)}%`} color={ivRankColor(dvol.iv_rank)} />
            <Metric label="IV Percentil" value={`${dvol.iv_percentile.toFixed(1)}%`} />
            <Metric label="Faixa 52s" value={`${dvol.min_52w.toFixed(0)}–${dvol.max_52w.toFixed(0)}`} muted />
          </div>
        </div>
      )}

      {/* Viés direcional */}
      {bias && (
        <div className="space-y-3">
          <p className="eyebrow">Viés direcional multiframe</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <BiasCell
              label="4H"
              bias={bias.bias_4h}
              sub={tv?.adx_4h !== null && tv?.adx_4h !== undefined ? `ADX ${tv.adx_4h.toFixed(1)}` : undefined}
            />
            <BiasCell label="Diário · Deribit"  bias={bias.bias_daily}  sub={`Close vs SMA20 (${bias.sma20.toFixed(0)})`} />
            <BiasCell label="Semanal · Deribit" bias={bias.bias_weekly} sub={`Close vs SMA50 (${bias.sma50.toFixed(0)})`} />
          </div>
          <div
            className="card-muted px-4 py-3 text-sm flex items-center gap-2"
            style={{ color: allBullish || allBearish ? "var(--color-text)" : "var(--color-text-muted)" }}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />
            {dirSuggestion}
          </div>
        </div>
      )}

      {/* Regime + HV/RSI */}
      {tv && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="card-muted p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Regime 1H (ADX)</p>
              {regime && <span className={`chip ${regime.chip}`}>{regime.label.toUpperCase()}</span>}
            </div>
            <div className="text-xs space-y-1 font-mono tabular">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-subtle)]">ADX 1H</span>
                <span className="text-[var(--color-text)]">{tv.adx_1h?.toFixed(1) ?? "–"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-subtle)]">ADX 4H</span>
                <span className="text-[var(--color-text)]">{tv.adx_4h?.toFixed(1) ?? "–"}</span>
              </div>
            </div>
            <div className="text-xs pt-2 border-t border-[var(--color-border)] text-[var(--color-text-muted)]">
              {tv.regime_1h === "RANGING" ? "✓ Ideal para vender premium" : "⚠ Evitar Iron Condor"}
            </div>
          </div>

          <div className="card-muted p-4 space-y-3">
            <p className="eyebrow">HV · RSI (Deribit)</p>
            {bias && (
              <div className="text-xs space-y-1 font-mono tabular">
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-subtle)]">ATR14</span>
                  <span className="text-[var(--color-text)]">{bias.atr14_pct.toFixed(2)}% do close</span>
                </div>
                {tv.hv_monthly !== null && (
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-subtle)]">HV mês</span>
                    <span className="text-[var(--color-text)]">{tv.hv_monthly.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              {bias && <RsiBar value={bias.rsi14} label="D RSI14" />}
              <RsiBar value={tv.rsi_1h} label="1H RSI" />
              <RsiBar value={tv.rsi_4h} label="4H RSI" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <div className="text-center">
      <div
        className="font-bold font-mono tabular text-base"
        style={{ color: muted ? "var(--color-text-muted)" : color ?? "var(--color-text)" }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)] mt-0.5">{label}</div>
    </div>
  );
}
