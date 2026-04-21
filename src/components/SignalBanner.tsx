"use client";

import type { SignalEntry } from "@/lib/signal-store";

interface Props {
  signal: SignalEntry | null;
}

const biasConfig = {
  bullish: { label: "ALTISTA", color: "var(--green)", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.3)" },
  bearish: { label: "BAIXISTA", color: "var(--red)", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.3)" },
  neutral: { label: "NEUTRO", color: "var(--yellow)", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.3)" },
};

export function SignalBanner({ signal }: Props) {
  if (!signal) {
    return (
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        Nenhum sinal recebido. Configure o webhook do TradingView para:{" "}
        <code className="text-xs" style={{ color: "var(--purple)" }}>
          POST /api/webhook
        </code>
      </div>
    );
  }

  const cfg = biasConfig[signal.bias];

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>
            SINAL TRADINGVIEW
          </span>
          <span className="text-lg font-bold" style={{ color: cfg.color }}>
            {cfg.label}
          </span>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {signal.ticker} · {signal.timeframe}
          </span>
        </div>
        <div className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
          <div>BTC ${signal.price.toLocaleString()}</div>
          <div>{new Date(signal.received_at).toLocaleTimeString("pt-BR")}</div>
        </div>
      </div>
      {Object.keys(signal.indicators).length > 0 && (
        <div className="mt-2 flex gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
          {Object.entries(signal.indicators).map(([k, v]) => (
            <span key={k}>
              {k.toUpperCase()}: <span style={{ color: "var(--text)" }}>{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
