"use client";

import { useEffect, useState } from "react";
import { InfoButton } from "./InfoButton";

interface FundingSnapshot {
  annualized_pct: number;
  rate_8h_pct: number;
  timestamp: number;
}

interface YahooQuote {
  symbol: string;
  price: number;
  change_pct: number;
}

interface EtfFlowSnapshot {
  last_net_flow_musd: number;
  last_date: string;
  recent: Array<{ date: string; net_flow_musd: number }>;
}

interface MacroData {
  btc_price: number | null;
  funding: FundingSnapshot | null;
  yahoo: YahooQuote[] | null;
  etf_flows: EtfFlowSnapshot | null;
  fetched_at: string;
  error?: string;
}

const YAHOO_LABELS: Record<string, { label: string; unit?: string; divisor?: number }> = {
  "DX-Y.NYB": { label: "DXY" },
  "^TNX": { label: "US10Y", unit: "%", divisor: 1 },
  "ES=F": { label: "S&P fut" },
  "GC=F": { label: "Gold fut" },
};

export function MacroCard() {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/macro");
      const json = (await res.json()) as MacroData;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar macro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return <div className="card p-3 text-xs text-[var(--color-danger)]">Macro: {error}</div>;
  }
  if (!data && loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Carregando contexto macro…
      </div>
    );
  }
  if (!data) return null;

  const { funding, yahoo, etf_flows } = data;

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Contexto macro</h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Funding Deribit · DXY / US10Y · fluxo de ETFs BTC (Farside, 1h de cache)
            </p>
          </div>
          <InfoButton
            title="Como usar o macro"
            summary={
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Funding positivo alto</strong> (&gt; 0.01%/8h) = perpetual comprado
                  demais → cuidado ao vender PUT, risco de pullback.
                </li>
                <li>
                  <strong>Funding negativo</strong> = shorts lotados, rali de short-squeeze
                  favorece venda de PUT.
                </li>
                <li>
                  <strong>DXY subindo + US10Y subindo</strong> = vento contra cripto, reduza
                  exposição PUT.
                </li>
                <li>
                  <strong>ETF flows positivos consecutivos</strong> = demanda spot, reforça
                  bias bullish e a venda de PUT OTM.
                </li>
                <li>
                  Saídas grandes nos ETFs = institucional sai, ritmo bearish — prefira bull-put
                  spread a naked.
                </li>
              </ul>
            }
          />
          <button onClick={load} disabled={loading} className="btn btn-ghost text-[11px]">
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-[11px] tabular font-mono">
        <MetricTile
          label="BTC"
          value={data.btc_price !== null ? `$${data.btc_price.toLocaleString()}` : "—"}
        />
        <MetricTile
          label="Funding 8h"
          value={funding ? `${funding.rate_8h_pct}%` : "—"}
          sub={funding ? `anual ${funding.annualized_pct}%` : undefined}
          tone={funding ? (funding.rate_8h_pct > 0.005 ? "warn" : funding.rate_8h_pct < -0.005 ? "good" : "neutral") : undefined}
        />
        {yahoo?.map((q) => {
          const meta = YAHOO_LABELS[q.symbol];
          if (!meta) return null;
          const value =
            q.symbol === "^TNX"
              ? `${(q.price / 1).toFixed(2)}%`
              : q.price.toLocaleString();
          return (
            <MetricTile
              key={q.symbol}
              label={meta.label}
              value={value}
              sub={
                q.change_pct
                  ? `${q.change_pct > 0 ? "+" : ""}${q.change_pct.toFixed(2)}%`
                  : undefined
              }
              tone={q.change_pct > 0 ? "good" : q.change_pct < 0 ? "warn" : "neutral"}
            />
          );
        }) ?? null}
      </div>

      {etf_flows && (
        <div className="card-muted p-2">
          <div className="flex items-center justify-between mb-2">
            <p className="eyebrow text-[10px]">ETF spot BTC · fluxo líquido diário (USD M)</p>
            <span
              className={`text-[11px] tabular font-mono ${
                etf_flows.last_net_flow_musd >= 0
                  ? "text-[var(--color-accent)]"
                  : "text-[var(--color-danger)]"
              }`}
            >
              {etf_flows.last_date}: {etf_flows.last_net_flow_musd > 0 ? "+" : ""}
              {etf_flows.last_net_flow_musd} M
            </span>
          </div>
          <div className="flex items-end gap-1 h-10">
            {[...etf_flows.recent].reverse().map((r) => {
              const abs = Math.max(...etf_flows.recent.map((x) => Math.abs(x.net_flow_musd)), 1);
              const pct = Math.abs(r.net_flow_musd) / abs;
              const isPos = r.net_flow_musd >= 0;
              return (
                <div
                  key={r.date}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                  title={`${r.date}: ${r.net_flow_musd} M`}
                >
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${Math.max(pct * 100, 4)}%`,
                      backgroundColor: isPos ? "rgba(52, 211, 153, 0.5)" : "rgba(248, 113, 113, 0.5)",
                    }}
                  />
                  <div className="text-[8px] text-[var(--color-text-muted)] mt-0.5 truncate w-full text-center">
                    {r.date.split(" ")[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
        <span>
          {funding ? "Funding OK" : "Funding falhou"} ·{" "}
          {yahoo && yahoo.length > 0 ? `Yahoo ${yahoo.length} símbolos` : "Yahoo falhou"} ·{" "}
          {etf_flows ? "ETF OK" : "ETF indisponível"}
        </span>
        <span>{new Date(data.fetched_at).toLocaleTimeString("pt-BR")}</span>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-[var(--color-accent)]"
      : tone === "warn"
      ? "text-[var(--color-danger)]"
      : "text-[var(--color-text)]";
  return (
    <div className="card-muted p-2">
      <div className="text-[10px] text-[var(--color-text-subtle)]">{label}</div>
      <div className={`font-semibold mt-0.5 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}
