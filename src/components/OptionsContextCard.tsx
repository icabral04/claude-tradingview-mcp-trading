"use client";

import { useState, useEffect } from "react";
import type { TvOptionsContext, MarketRegime, DirectionalBias } from "@/app/api/tv-analysis/route";
import type { DvolResult } from "@/lib/deribit/client";
import type { BtcBiasResult } from "@/app/api/btc-bias/route";

// ── Regime ────────────────────────────────────────────────────────────────────

const REGIME_CFG: Record<MarketRegime, { label: string; color: string; bg: string }> = {
  RANGING:   { label: "LATERAL",    color: "var(--green)",  bg: "rgba(34,197,94,0.1)" },
  TRENDING:  { label: "TENDÊNCIA",  color: "var(--yellow)", bg: "rgba(245,158,11,0.1)" },
  BREAKOUT:  { label: "ROMPIMENTO", color: "var(--red)",    bg: "rgba(239,68,68,0.1)" },
};

const BIAS_CFG: Record<DirectionalBias, { label: string; color: string }> = {
  BULLISH: { label: "ALTISTA",  color: "var(--green)" },
  BEARISH: { label: "BAIXISTA", color: "var(--red)" },
  NEUTRAL: { label: "NEUTRO",   color: "var(--yellow)" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ivRankColor(rank: number): string {
  if (rank >= 50) return "var(--green)";
  if (rank >= 30) return "var(--yellow)";
  return "var(--red)";
}

function ivRankLabel(rank: number): string {
  if (rank >= 50) return "VENDER PREMIUM ✓";
  if (rank >= 30) return "IV MODERADA — CAUTELA";
  return "IV BAIXA — AGUARDAR";
}

const BIAS_ACTION: Record<DirectionalBias, string> = {
  BULLISH: "vender PUT",
  BEARISH: "vender CALL",
  NEUTRAL: "Iron Condor",
};

function BiasCell({ label, bias, sub }: { label: string; bias: DirectionalBias; sub?: string }) {
  const cfg = BIAS_CFG[bias];
  return (
    <div
      className="rounded p-3 flex flex-col gap-1"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
      <div className="text-xs font-mono" style={{ color: cfg.color, opacity: 0.7 }}>{BIAS_ACTION[bias]}</div>
      {sub && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function RsiBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const pct = Math.min(100, Math.max(0, value));
  const color = value > 70 ? "var(--red)" : value < 30 ? "var(--green)" : "var(--blue)";
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--background)" }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-10 text-xs text-right font-mono" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

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
      const [tvJson, dvolJson, biasJson] = await Promise.all([
        tvRes.json(),
        dvolRes.json(),
        biasRes.json(),
      ]);
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
      <div className="rounded-lg p-4 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        Carregando contexto de opções...
      </div>
    );
  }

  if (error && !tv) {
    return (
      <div className="rounded-lg p-4 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--red)" }}>
        {error}
      </div>
    );
  }

  const regime = tv ? REGIME_CFG[tv.regime_1h] : null;

  // Derive directional suggestion from bias
  const allBullish = bias?.bias_4h === "BULLISH" && bias?.bias_daily === "BULLISH";
  const allBearish = bias?.bias_4h === "BEARISH" && bias?.bias_daily === "BEARISH";
  const dirSuggestion = allBullish
    ? "→ VENDER PUTS OTM · mercado acima do strike = lucro máximo"
    : allBearish
    ? "→ VENDER CALLS OTM · mercado abaixo do strike = lucro máximo"
    : "→ VENDER PUTS + CALLS OTM (Iron Condor) · ou aguardar alinhamento";

  return (
    <div className="rounded-lg p-4 space-y-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>
          CONTEXTO BTC · OPÇÕES
        </h2>
        {bias && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span style={{ color: "var(--text)" }}>${bias.close.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</span>
            <span style={{ color: "var(--text-muted)" }}>
              SMA20 <span style={{ color: bias.close > bias.sma20 ? "var(--green)" : "var(--red)" }}>{bias.sma20.toFixed(0)}</span>
              {" · "}
              SMA50 <span style={{ color: bias.close > bias.sma50 ? "var(--green)" : "var(--red)" }}>{bias.sma50.toFixed(0)}</span>
            </span>
            {tv && <span style={{ color: "var(--text-muted)" }}>{new Date(tv.fetched_at).toLocaleTimeString("pt-BR")}</span>}
          </div>
        )}
      </div>

      {/* IV Rank — gate Lee Lowell */}
      {dvol && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>DVOL · IV RANK 52 SEMANAS</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color: ivRankColor(dvol.iv_rank), background: `${ivRankColor(dvol.iv_rank)}22` }}>
              {ivRankLabel(dvol.iv_rank)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{dvol.min_52w.toFixed(0)}</span>
            <div className="flex-1 h-2 rounded-full relative" style={{ background: "var(--background)" }}>
              <div
                className="absolute h-2 rounded-full"
                style={{
                  left: "0%",
                  width: `${dvol.iv_rank}%`,
                  background: `linear-gradient(90deg, rgba(59,130,246,0.4), ${ivRankColor(dvol.iv_rank)})`,
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2"
                style={{ left: `calc(${dvol.iv_rank}% - 5px)`, background: ivRankColor(dvol.iv_rank), borderColor: "var(--background)" }}
              />
            </div>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{dvol.max_52w.toFixed(0)}</span>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs text-center">
            <div>
              <div className="font-bold font-mono text-sm" style={{ color: ivRankColor(dvol.iv_rank) }}>{dvol.current.toFixed(1)}</div>
              <div style={{ color: "var(--text-muted)" }}>DVOL atual</div>
            </div>
            <div>
              <div className="font-bold font-mono text-sm" style={{ color: ivRankColor(dvol.iv_rank) }}>{dvol.iv_rank.toFixed(1)}%</div>
              <div style={{ color: "var(--text-muted)" }}>IV Rank</div>
            </div>
            <div>
              <div className="font-bold font-mono text-sm" style={{ color: "var(--text)" }}>{dvol.iv_percentile.toFixed(1)}%</div>
              <div style={{ color: "var(--text-muted)" }}>IV Percentil</div>
            </div>
            <div>
              <div className="font-bold font-mono text-sm" style={{ color: "var(--text-muted)" }}>{dvol.min_52w.toFixed(0)}–{dvol.max_52w.toFixed(0)}</div>
              <div style={{ color: "var(--text-muted)" }}>Faixa 52s</div>
            </div>
          </div>
        </div>
      )}

      {/* Viés direcional — 4H / Diário / Semanal */}
      {bias && (
        <div className="space-y-2">
          <div className="text-xs font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>VIÉS DIRECIONAL</div>
          <div className="grid grid-cols-3 gap-3">
            <BiasCell
              label="4H · TRADINGVIEW"
              bias={bias.bias_4h}
              sub={tv?.adx_4h !== null && tv?.adx_4h !== undefined ? `ADX ${tv.adx_4h.toFixed(1)}` : undefined}
            />
            <BiasCell
              label="DIÁRIO · DERIBIT"
              bias={bias.bias_daily}
              sub={`Close vs SMA20 (${bias.sma20.toFixed(0)})`}
            />
            <BiasCell
              label="SEMANAL · DERIBIT"
              bias={bias.bias_weekly}
              sub={`Close vs SMA50 (${bias.sma50.toFixed(0)})`}
            />
          </div>
          <div
            className="rounded px-3 py-2 text-xs"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: allBullish || allBearish ? "var(--text)" : "var(--text-muted)" }}
          >
            {dirSuggestion}
          </div>
        </div>
      )}

      {/* Regime de mercado + HV + RSI */}
      {tv && (
        <div className="grid grid-cols-2 gap-3">

          {/* Regime */}
          <div className="rounded p-3 space-y-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="text-xs font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>REGIME 1H (ADX)</div>
            <div className="font-bold" style={{ color: regime?.color }}>{regime?.label}</div>
            <div className="text-xs space-y-0.5" style={{ color: "var(--text-muted)" }}>
              <div>ADX 1H: <span className="font-mono" style={{ color: "var(--text)" }}>{tv.adx_1h?.toFixed(1) ?? "–"}</span></div>
              <div>ADX 4H: <span className="font-mono" style={{ color: "var(--text)" }}>{tv.adx_4h?.toFixed(1) ?? "–"}</span></div>
            </div>
            <div className="text-xs pt-1" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
              {tv.regime_1h === "RANGING" ? "✓ Ideal para vender premium" : "⚠ Evitar Iron Condor"}
            </div>
          </div>

          {/* HV + RSI */}
          <div className="rounded p-3 space-y-2" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="text-xs font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>HV · RSI (DERIBIT)</div>
            {bias && (
              <div className="text-xs space-y-0.5">
                <div>ATR14: <span className="font-mono" style={{ color: "var(--text)" }}>{bias.atr14_pct.toFixed(2)}% do close</span></div>
                {tv.hv_monthly !== null && (
                  <div>HV mês: <span className="font-mono" style={{ color: "var(--text)" }}>{tv.hv_monthly.toFixed(2)}%</span></div>
                )}
              </div>
            )}
            <div className="space-y-1.5 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
              {bias && <RsiBar value={bias.rsi14} label="D RSI14" />}
              <RsiBar value={tv.rsi_1h} label="1H RSI" />
              <RsiBar value={tv.rsi_4h} label="4H RSI" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
