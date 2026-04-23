"use client";

import { useEffect, useState } from "react";
import type { DeribitAccountSummary } from "@/lib/deribit/types";

type AccountData = DeribitAccountSummary & { btc_price: number | null };

const fmtBtc = (v: number, d = 6) => `${v >= 0 ? "" : ""}${v.toFixed(d)} BTC`;
const fmtBtcSigned = (v: number, d = 6) => `${v >= 0 ? "+" : ""}${v.toFixed(d)} BTC`;
const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function AccountSummary() {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAccount() {
    try {
      const res = await fetch("/api/account");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar conta");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAccount();
    const interval = setInterval(fetchAccount, 15_000);
    return () => clearInterval(interval);
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
        {error ?? "Sem dados de conta"}
      </section>
    );
  }

  const btc = data.btc_price ?? 0;
  const n = (v: number | undefined | null) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const equity = n(data.equity);
  const available = n(data.available_funds);
  const balance = n(data.balance);
  const initialMargin = n(data.initial_margin);
  const maintMargin = n(data.maintenance_margin);
  const sessionRpl = n(data.session_rpl);
  const sessionUpl = n(data.session_upl);
  const sessionFunding = n(data.session_funding);
  const optionsValue = n(data.options_value);
  const optionsPl = n(data.options_pl);
  const futuresPl = n(data.futures_pl);
  const totalPl = n(data.total_pl);
  const optionsDelta = n(data.options_delta);
  const optionsGamma = n(data.options_gamma);
  const optionsTheta = n(data.options_theta);
  const optionsVega = n(data.options_vega);

  const sessionPl = sessionRpl + sessionUpl;
  const marginUsage = equity > 0 ? (initialMargin / equity) * 100 : 0;
  const marginTone = marginUsage > 70 ? "danger" : marginUsage > 40 ? "warning" : "success";

  const equityUsd = equity * btc;
  const availUsd = available * btc;
  const sessionPlUsd = sessionPl * btc;

  return (
    <section className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="eyebrow">Conta Deribit</p>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mt-0.5">
            Saldo · margem · P&L da sessão
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip chip-info font-mono tabular">{data.currency}</span>
          <span className="text-xs text-[var(--color-text-subtle)] font-mono tabular">
            {new Date(data.creation_timestamp).toLocaleTimeString("pt-BR")}
          </span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="Equity"
          primary={fmtBtc(equity)}
          secondary={btc ? fmtUsd(equityUsd) : undefined}
          tone="default"
          hint="balance + PnL + options value"
        />
        <Kpi
          label="Disponível"
          primary={fmtBtc(available)}
          secondary={btc ? fmtUsd(availUsd) : undefined}
          tone="accent"
          hint="para novas ordens"
        />
        <Kpi
          label="P&L sessão"
          primary={fmtBtcSigned(sessionPl)}
          secondary={btc ? `${sessionPl >= 0 ? "+" : ""}${fmtUsd(sessionPlUsd)}` : undefined}
          tone={sessionPl >= 0 ? "success" : "danger"}
          hint={`R ${sessionRpl.toFixed(6)} · U ${sessionUpl.toFixed(6)}`}
        />
        <MarginKpi
          used={initialMargin}
          maint={maintMargin}
          equity={equity}
          tone={marginTone}
          pct={marginUsage}
        />
      </div>

      {/* Secondary grid: greeks da conta + balance/funding */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-muted p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Greeks agregados</p>
            <span className="chip chip-accent">Σ posições</span>
          </div>
          <div className="grid grid-cols-4 gap-2 pt-1">
            <GreekCell label="Δ" value={optionsDelta} hint="delta total" />
            <GreekCell label="Γ" value={optionsGamma} precision={5} />
            <GreekCell label="Θ" value={optionsTheta} tone="danger" hint="theta/dia" />
            <GreekCell label="V" value={optionsVega} />
          </div>
        </div>

        <div className="card-muted p-4 space-y-2">
          <p className="eyebrow">Detalhamento</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono tabular pt-1">
            <KV k="Balance" v={fmtBtc(balance)} />
            <KV k="Options value" v={fmtBtc(optionsValue)} />
            <KV
              k="Options P&L"
              v={fmtBtcSigned(optionsPl)}
              tone={optionsPl >= 0 ? "success" : "danger"}
            />
            <KV
              k="Futures P&L"
              v={fmtBtcSigned(futuresPl)}
              tone={futuresPl >= 0 ? "success" : "danger"}
            />
            <KV k="Session funding" v={fmtBtcSigned(sessionFunding)} />
            <KV
              k="Total P&L"
              v={fmtBtcSigned(totalPl)}
              tone={totalPl >= 0 ? "success" : "danger"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type Tone = "success" | "danger" | "warning" | "accent" | "default";

function toneColor(tone: Tone): string {
  return {
    success: "var(--color-success)",
    danger: "var(--color-danger)",
    warning: "var(--color-warning)",
    accent: "var(--color-accent)",
    default: "var(--color-text)",
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
      {hint && <p className="text-[11px] text-[var(--color-text-subtle)] mt-1.5">{hint}</p>}
    </div>
  );
}

function MarginKpi({
  used,
  maint,
  equity,
  tone,
  pct,
}: {
  used: number;
  maint: number;
  equity: number;
  tone: Tone;
  pct: number;
}) {
  const color = toneColor(tone);
  const chipClass = {
    success: "chip-success",
    warning: "chip-warning",
    danger: "chip-danger",
    accent: "chip-accent",
    default: "chip-info",
  }[tone];

  return (
    <div className="card-muted p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="eyebrow">Margem</p>
        <span className={`chip ${chipClass} font-mono tabular`}>{pct.toFixed(1)}%</span>
      </div>
      <p className="text-xl font-semibold font-mono tabular tracking-tight" style={{ color }}>
        {used.toFixed(4)} BTC
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-[var(--color-bg)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, pct)}%`, background: color }}
        />
      </div>
      <p className="text-[11px] text-[var(--color-text-subtle)] mt-1.5 font-mono tabular">
        IM {used.toFixed(4)} · MM {maint.toFixed(4)} · eq {equity.toFixed(4)}
      </p>
    </div>
  );
}

function GreekCell({
  label,
  value,
  precision = 4,
  tone,
  hint,
}: {
  label: string;
  value: number;
  precision?: number;
  tone?: Tone;
  hint?: string;
}) {
  const color = tone ? toneColor(tone) : Math.abs(value) < 1e-6 ? "var(--color-text-subtle)" : "var(--color-text)";
  return (
    <div className="text-center" title={hint}>
      <div className="text-[11px] uppercase tracking-widest text-[var(--color-text-subtle)] mb-0.5">
        {label}
      </div>
      <div className="text-sm font-mono tabular font-semibold" style={{ color }}>
        {value.toFixed(precision)}
      </div>
    </div>
  );
}

function KV({ k, v, tone }: { k: string; v: string; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-subtle)]">{k}</span>
      <span style={{ color: tone ? toneColor(tone) : "var(--color-text)" }}>{v}</span>
    </div>
  );
}
