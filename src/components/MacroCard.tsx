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

interface FearGreedSnapshot {
  value: number;
  classification: string;
  timestamp: number;
}

interface MacroData {
  btc_price: number | null;
  funding: FundingSnapshot | null;
  yahoo: YahooQuote[] | null;
  fear_greed: FearGreedSnapshot | null;
  etf_flows: EtfFlowSnapshot | null;
  fetched_at: string;
  error?: string;
}

type YahooMeta = {
  label: string;
  kind?: "yield" | "price";
  // Para yields: Yahoo retorna alguns como % direto (^TNX, ^IRX ambos em %).
  // Se mudar: ajustar aqui.
};

const YAHOO_LABELS: Record<string, YahooMeta> = {
  "DX-Y.NYB": { label: "DXY" },
  "^TNX": { label: "US10Y", kind: "yield" },
  "^IRX": { label: "US3M", kind: "yield" },
  "^VIX": { label: "VIX" },
  "ES=F": { label: "S&P fut" },
  "NQ=F": { label: "NASDAQ fut" },
  "GC=F": { label: "Gold fut" },
  "CL=F": { label: "Crude fut" },
  "ETH-USD": { label: "ETH" },
};

// Ordem controlada para render consistente.
const YAHOO_ORDER = [
  "DX-Y.NYB",
  "^TNX",
  "^IRX",
  "^VIX",
  "ES=F",
  "NQ=F",
  "GC=F",
  "CL=F",
  "ETH-USD",
];

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

  const { funding, yahoo, fear_greed, etf_flows } = data;
  const yahooBySymbol = new Map((yahoo ?? []).map((q) => [q.symbol, q] as const));
  const orderedYahoo = YAHOO_ORDER.map((s) => yahooBySymbol.get(s)).filter(
    (q): q is YahooQuote => Boolean(q)
  );

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Contexto macro</h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Funding Deribit · DXY / yields / VIX · S&P, NASDAQ, Gold, Crude · ETH · Fear
              &amp; Greed · fluxo ETFs BTC (Farside, 1h)
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
                <li>
                  <strong>VIX alto (&gt; 20) e subindo</strong> = risk-off em ações tende a
                  arrastar cripto — reduza delta; <strong>VIX caindo</strong> favorece venda
                  de prêmio.
                </li>
                <li>
                  <strong>NASDAQ fut subindo</strong> é o sinal mais colado ao BTC (correlação
                  tech). Divergência forte (BTC sobe, NQ cai) costuma corrigir para o lado das
                  ações.
                </li>
                <li>
                  <strong>Curva US3M vs US10Y</strong>: se o short-end sobe mais rápido que o
                  longo (curva flattening/invertendo), aperto monetário → risco extra em ativos
                  de risco.
                </li>
                <li>
                  <strong>ETH caindo com BTC estável</strong> = fraqueza cripto interna;
                  <strong> ETH puxando BTC</strong> = risk-on cripto amplo.
                </li>
                <li>
                  <strong>Fear &amp; Greed ≤ 25 (fear extremo)</strong> historicamente é bom
                  momento p/ vender PUT OTM; <strong>≥ 75 (greed extremo)</strong> topos
                  locais, cuidado com premium baixo e reversão.
                </li>
              </ul>
            }
          />
          <button onClick={load} disabled={loading} className="btn btn-ghost text-[11px]">
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2 text-[11px] tabular font-mono">
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
        <MetricTile
          label="Fear & Greed"
          value={fear_greed ? `${fear_greed.value}` : "—"}
          sub={fear_greed ? fear_greed.classification : undefined}
          tone={
            fear_greed
              ? fear_greed.value >= 75
                ? "warn" // greed extremo → tops locais, ruim p/ vender PUT agressivo
                : fear_greed.value <= 25
                ? "good" // fear extremo → bom p/ venda de PUT OTM
                : "neutral"
              : undefined
          }
        />
        {orderedYahoo.map((q) => {
          const meta = YAHOO_LABELS[q.symbol];
          if (!meta) return null;
          const value =
            meta.kind === "yield"
              ? `${q.price.toFixed(2)}%`
              : q.price.toLocaleString();
          // VIX: alto = risco-off → ruim p/ bullish
          // Demais: + preço ≈ risk-on → good
          const tone =
            q.symbol === "^VIX"
              ? q.change_pct > 0
                ? "warn"
                : q.change_pct < 0
                ? "good"
                : "neutral"
              : q.symbol === "DX-Y.NYB"
              ? q.change_pct > 0
                ? "warn" // DXY sobe = vento contra cripto
                : q.change_pct < 0
                ? "good"
                : "neutral"
              : q.change_pct > 0
              ? "good"
              : q.change_pct < 0
              ? "warn"
              : "neutral";
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
              tone={tone}
            />
          );
        })}
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
          {fear_greed ? "F&G OK" : "F&G indisponível"} ·{" "}
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
