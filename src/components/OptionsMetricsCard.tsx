"use client";

import { useEffect, useState } from "react";
import type { OptionsMetricsResult } from "@/lib/metrics/options-metrics";

const fmtUsd = (v: number) =>
  v >= 1e9
    ? `$${(v / 1e9).toFixed(2)}B`
    : v >= 1e6
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1e3
    ? `$${(v / 1e3).toFixed(1)}K`
    : `$${v.toFixed(0)}`;

const fmtBtc = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(2)}K` : v.toFixed(1);

function pcrTone(pcr: number): "success" | "danger" | "warning" {
  if (pcr > 1.1) return "danger"; // muito put → bearish
  if (pcr < 0.75) return "success"; // muito call → bullish
  return "warning";
}

function pcrLabel(pcr: number): string {
  if (pcr > 1.1) return "Bearish";
  if (pcr < 0.75) return "Bullish";
  return "Neutro";
}

export function OptionsMetricsCard() {
  const [data, setData] = useState<OptionsMetricsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    try {
      const res = await fetch("/api/options-metrics");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar métricas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <section className="card p-5 space-y-4">
        <div className="skeleton h-4 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="card p-4 text-sm text-[var(--color-danger)]">
        {error ?? "Sem métricas disponíveis"}
      </section>
    );
  }

  const totalOi = data.total_call_oi + data.total_put_oi;
  const totalVol = data.total_call_volume_24h + data.total_put_volume_24h;
  const callOiPct = totalOi > 0 ? (data.total_call_oi / totalOi) * 100 : 0;
  const callVolPct = totalVol > 0 ? (data.total_call_volume_24h / totalVol) * 100 : 0;

  // Expiries filtrados: só mostrar os que têm OI relevante (>= 10 BTC)
  const relevantExpiries = data.expiries
    .filter((e) => e.call_oi + e.put_oi >= 10)
    .slice(0, 8);

  const maxStrikeOi = Math.max(...data.top_strikes_by_oi.map((s) => s.total_oi), 1);

  return (
    <section className="card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Métricas de opções BTC</p>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-0.5">
            Put/Call ratio · Max Pain · Term structure
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono tabular text-[var(--color-text-subtle)]">
          <span>{data.total_instruments} instrumentos</span>
          <span>·</span>
          <span>{new Date(data.fetched_at).toLocaleTimeString("pt-BR")}</span>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <PcrKpi
          label="P/C Ratio · OI"
          pcr={data.pcr_oi}
          callPct={callOiPct}
          callVal={data.total_call_oi}
          putVal={data.total_put_oi}
          unit="BTC"
        />
        <PcrKpi
          label="P/C Ratio · 24h"
          pcr={data.pcr_volume}
          callPct={callVolPct}
          callVal={data.total_call_volume_24h}
          putVal={data.total_put_volume_24h}
          unit="BTC"
        />
        <Kpi
          label="Open interest"
          primary={`${fmtBtc(totalOi)} BTC`}
          secondary={fmtUsd(data.total_oi_usd)}
          tone="accent"
          hint={`${data.total_call_oi.toFixed(0)} calls · ${data.total_put_oi.toFixed(0)} puts`}
        />
        <Kpi
          label="Volume 24h"
          primary={`${fmtBtc(totalVol)} BTC`}
          secondary={fmtUsd(data.total_volume_usd_24h)}
          tone="info"
          hint={`${data.total_call_volume_24h.toFixed(0)} calls · ${data.total_put_volume_24h.toFixed(0)} puts`}
        />
      </div>

      {/* Term structure + Max pain */}
      <div className="card-muted p-0 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-[var(--color-border)]">
          <p className="eyebrow">Term structure · Max pain por vencimento</p>
          <span className="text-[10px] text-[var(--color-text-subtle)] font-mono tabular">
            BTC ${data.btc_price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Vencimento</th>
                <th className="text-right">DTE</th>
                <th className="text-right">ATM IV</th>
                <th className="text-right">Max Pain</th>
                <th className="text-right">Δ Spot</th>
                <th className="text-right">Call OI</th>
                <th className="text-right">Put OI</th>
                <th className="text-right">P/C OI</th>
                <th className="text-right">Vol 24h</th>
                <th className="text-right">Strikes</th>
              </tr>
            </thead>
            <tbody>
              {relevantExpiries.map((e) => {
                const total = e.call_oi + e.put_oi;
                const totalVol24h = e.call_volume + e.put_volume;
                const painDelta = e.max_pain !== null ? ((e.max_pain - data.btc_price) / data.btc_price) * 100 : null;
                const tone = pcrTone(e.pcr_oi);
                const toneColor = tone === "success" ? "var(--color-success)" : tone === "danger" ? "var(--color-danger)" : "var(--color-warning)";
                return (
                  <tr key={e.expiration_timestamp}>
                    <td className="font-mono text-xs">{e.label}</td>
                    <td className="text-right tabular font-mono text-[var(--color-text-muted)]">{e.dte}d</td>
                    <td className="text-right tabular font-mono">
                      {e.atm_iv !== null ? `${e.atm_iv.toFixed(1)}%` : "—"}
                    </td>
                    <td className="text-right tabular font-mono text-[var(--color-accent)]">
                      {e.max_pain !== null ? `$${e.max_pain.toLocaleString()}` : "—"}
                    </td>
                    <td
                      className="text-right tabular font-mono"
                      style={{
                        color: painDelta === null ? "var(--color-text-subtle)" : painDelta > 0 ? "var(--color-success)" : "var(--color-danger)",
                      }}
                    >
                      {painDelta !== null ? `${painDelta >= 0 ? "+" : ""}${painDelta.toFixed(1)}%` : "—"}
                    </td>
                    <td className="text-right tabular font-mono text-[var(--color-text-muted)]">{e.call_oi.toFixed(0)}</td>
                    <td className="text-right tabular font-mono text-[var(--color-text-muted)]">{e.put_oi.toFixed(0)}</td>
                    <td className="text-right">
                      <span className="font-mono tabular" style={{ color: toneColor }}>
                        {e.pcr_oi.toFixed(2)}
                      </span>
                    </td>
                    <td className="text-right tabular font-mono text-[var(--color-text-muted)]">
                      {totalVol24h.toFixed(0)}
                      <span className="text-[10px] text-[var(--color-text-subtle)] ml-1">
                        ({total > 0 ? ((totalVol24h / total) * 100).toFixed(0) : 0}%)
                      </span>
                    </td>
                    <td className="text-right tabular font-mono text-[var(--color-text-subtle)]">{e.strikes_count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* OI distribution por strike */}
      <div className="card-muted p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Open interest por strike (top 15)</p>
          <div className="flex items-center gap-3 text-[10px] text-[var(--color-text-subtle)]">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-[var(--color-danger)]" /> Calls
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-sm bg-[var(--color-success)]" /> Puts
            </span>
          </div>
        </div>
        <div className="space-y-1">
          {data.top_strikes_by_oi.map((s) => {
            const callPct = (s.call_oi / maxStrikeOi) * 100;
            const putPct = (s.put_oi / maxStrikeOi) * 100;
            const isNearSpot = Math.abs(s.strike - data.btc_price) / data.btc_price < 0.02;
            return (
              <div key={s.strike} className="flex items-center gap-2 text-xs">
                <div
                  className="w-20 font-mono tabular text-right"
                  style={{ color: isNearSpot ? "var(--color-accent)" : "var(--color-text)" }}
                >
                  ${s.strike.toLocaleString()}
                  {isNearSpot && <span className="ml-1 text-[9px]">●</span>}
                </div>
                <div className="flex-1 flex items-center gap-0.5 h-4">
                  <div
                    className="h-full rounded-l-sm transition-all"
                    style={{ width: `${callPct}%`, background: "var(--color-danger)", opacity: 0.75 }}
                    title={`Calls: ${s.call_oi.toFixed(0)} BTC`}
                  />
                  <div
                    className="h-full rounded-r-sm transition-all"
                    style={{ width: `${putPct}%`, background: "var(--color-success)", opacity: 0.75 }}
                    title={`Puts: ${s.put_oi.toFixed(0)} BTC`}
                  />
                </div>
                <div className="w-24 font-mono tabular text-right text-[var(--color-text-muted)]">
                  {s.total_oi.toFixed(0)} BTC
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Tone = "success" | "danger" | "warning" | "accent" | "info" | "default";

function toneColor(tone: Tone): string {
  return {
    success: "var(--color-success)",
    danger: "var(--color-danger)",
    warning: "var(--color-warning)",
    accent: "var(--color-accent)",
    info: "var(--color-info)",
    default: "var(--color-text)",
  }[tone];
}

function toneChip(tone: Tone): string {
  return {
    success: "chip-success",
    danger: "chip-danger",
    warning: "chip-warning",
    accent: "chip-accent",
    info: "chip-info",
    default: "chip-info",
  }[tone];
}

function Kpi({
  label,
  primary,
  secondary,
  tone,
  hint,
}: {
  label: string;
  primary: string;
  secondary?: string;
  tone: Tone;
  hint?: string;
}) {
  return (
    <div className="card-muted p-4">
      <p className="eyebrow mb-2">{label}</p>
      <p className="text-xl font-semibold font-mono tabular tracking-tight" style={{ color: toneColor(tone) }}>
        {primary}
      </p>
      {secondary && (
        <p className="text-xs text-[var(--color-text-muted)] font-mono tabular mt-0.5">{secondary}</p>
      )}
      {hint && <p className="text-[10px] text-[var(--color-text-subtle)] mt-1.5 font-mono tabular">{hint}</p>}
    </div>
  );
}

function PcrKpi({
  label,
  pcr,
  callPct,
  callVal,
  putVal,
  unit,
}: {
  label: string;
  pcr: number;
  callPct: number;
  callVal: number;
  putVal: number;
  unit: string;
}) {
  const tone = pcrTone(pcr);
  const chip = toneChip(tone);
  const color = toneColor(tone);
  const putPct = 100 - callPct;

  return (
    <div className="card-muted p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="eyebrow">{label}</p>
        <span className={`chip ${chip}`}>{pcrLabel(pcr)}</span>
      </div>
      <p className="text-xl font-semibold font-mono tabular tracking-tight" style={{ color }}>
        {pcr.toFixed(2)}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden flex">
        <div className="h-full bg-[var(--color-danger)] opacity-75" style={{ width: `${callPct}%` }} />
        <div className="h-full bg-[var(--color-success)] opacity-75" style={{ width: `${putPct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono tabular text-[var(--color-text-subtle)]">
        <span>C {callVal.toFixed(0)} {unit}</span>
        <span>P {putVal.toFixed(0)} {unit}</span>
      </div>
    </div>
  );
}
