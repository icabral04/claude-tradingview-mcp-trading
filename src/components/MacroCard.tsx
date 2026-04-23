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

interface FredObservation {
  series_id: string;
  label: string;
  value: number;
  date: string;
  change_pct: number | null;
  observed_at: number;
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
  btc_price_observed_at: number | null;
  funding: FundingSnapshot | null;
  fred: FredObservation[] | null;
  yahoo: YahooQuote[] | null;
  fear_greed: FearGreedSnapshot | null;
  etf_flows: EtfFlowSnapshot | null;
  fetched_at: string;
  error?: string;
}

type YahooMeta = {
  label: string;
  kind?: "yield" | "price";
};

const YAHOO_LABELS: Record<string, YahooMeta> = {
  "ES=F": { label: "S&P fut" },
  "NQ=F": { label: "NASDAQ fut" },
  "GC=F": { label: "Gold fut" },
  "CL=F": { label: "Crude fut" },
  "ETH-USD": { label: "ETH" },
};

const YAHOO_ORDER = ["ES=F", "NQ=F", "GC=F", "CL=F", "ETH-USD"];

// Séries FRED ordenadas na ordem de render desejada.
const FRED_ORDER = ["DTWEXBGS", "DGS10", "DGS2", "VIXCLS"];

function relativeAge(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  return `${day}d`;
}

// Define se um dado está "stale" pelo ponto de vista da fonte.
// Thresholds heurísticos: FRED é diário, Yahoo intraday, Deribit tempo real.
function isStale(ageMs: number, sourceTtlMs: number): boolean {
  return ageMs > sourceTtlMs;
}

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

  const { funding, yahoo, fred, fear_greed, etf_flows } = data;
  const yahooBySymbol = new Map((yahoo ?? []).map((q) => [q.symbol, q] as const));
  const orderedYahoo = YAHOO_ORDER.map((s) => yahooBySymbol.get(s)).filter(
    (q): q is YahooQuote => Boolean(q)
  );
  const fredBySymbol = new Map((fred ?? []).map((o) => [o.series_id, o] as const));
  const orderedFred = FRED_ORDER.map((id) => fredBySymbol.get(id)).filter(
    (o): o is FredObservation => Boolean(o)
  );

  // BTC é tempo real → stale se > 2min. FRED é diário → stale se > 2 dias úteis (~3d).
  // Yahoo futuros → stale se > 30 min. ETF Farside → stale se > 2 dias.
  const btcAgeMs =
    data.btc_price_observed_at !== null ? Date.now() - data.btc_price_observed_at : null;

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Contexto macro</h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Deribit (BTC, funding) · FRED oficial (DXY, yields, VIX) · Yahoo (futuros, ETH) ·
              Fear &amp; Greed · ETFs BTC (Farside)
            </p>
          </div>
          <InfoButton
            title="Fontes e como usar o macro"
            summary={
              <div className="space-y-2">
                <p className="text-[11px]">
                  <strong>Confiabilidade das fontes:</strong> Deribit e FRED são oficiais
                  (exchange e Fed de St. Louis). Yahoo é best-effort (API não oficial).
                  Farside é scrape diário. Cada tile mostra a idade do dado.
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>
                    <strong>Funding positivo alto</strong> (&gt; 0.01%/8h) = perpetual comprado
                    demais → cuidado ao vender PUT.
                  </li>
                  <li>
                    <strong>Funding negativo</strong> = shorts lotados, short-squeeze favorece
                    venda de PUT.
                  </li>
                  <li>
                    <strong>DXY + US10Y subindo</strong> = vento contra cripto.
                  </li>
                  <li>
                    <strong>Curva US2Y vs US10Y</strong> invertendo = aperto monetário à frente.
                  </li>
                  <li>
                    <strong>VIX alto</strong> (&gt; 20) arrasta cripto; <strong>VIX caindo</strong>
                    favorece venda de prêmio.
                  </li>
                  <li>
                    <strong>NASDAQ fut</strong> é o sinal mais colado ao BTC (correlação tech).
                  </li>
                  <li>
                    <strong>ETF flows positivos consecutivos</strong> = demanda spot, reforça
                    bias bullish.
                  </li>
                  <li>
                    <strong>ETH divergindo de BTC</strong>: ETH caindo com BTC estável = fraqueza
                    cripto interna.
                  </li>
                  <li>
                    <strong>Fear &amp; Greed ≤ 25</strong> = bom p/ vender PUT OTM;
                    <strong> ≥ 75</strong> = topos locais.
                  </li>
                </ul>
              </div>
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
          source="Deribit"
          ageMs={btcAgeMs}
          stale={btcAgeMs !== null && isStale(btcAgeMs, 2 * 60_000)}
          value={data.btc_price !== null ? `$${data.btc_price.toLocaleString()}` : "—"}
        />
        <MetricTile
          label="Funding 8h"
          source="Deribit"
          ageMs={funding ? Date.now() - funding.timestamp : null}
          stale={funding ? isStale(Date.now() - funding.timestamp, 10 * 60_000) : false}
          value={funding ? `${funding.rate_8h_pct}%` : "—"}
          sub={funding ? `anual ${funding.annualized_pct}%` : undefined}
          tone={
            funding
              ? funding.rate_8h_pct > 0.005
                ? "warn"
                : funding.rate_8h_pct < -0.005
                ? "good"
                : "neutral"
              : undefined
          }
        />
        <MetricTile
          label="Fear & Greed"
          source="alternative.me"
          ageMs={fear_greed ? Date.now() - fear_greed.timestamp : null}
          // F&G é diário; stale se > 36h
          stale={fear_greed ? isStale(Date.now() - fear_greed.timestamp, 36 * 3600_000) : false}
          value={fear_greed ? `${fear_greed.value}` : "—"}
          sub={fear_greed ? fear_greed.classification : undefined}
          tone={
            fear_greed
              ? fear_greed.value >= 75
                ? "warn"
                : fear_greed.value <= 25
                ? "good"
                : "neutral"
              : undefined
          }
        />
        {orderedFred.map((o) => {
          const isYield = o.series_id === "DGS10" || o.series_id === "DGS2";
          const isDxy = o.series_id === "DTWEXBGS";
          const isVix = o.series_id === "VIXCLS";
          const value = isYield ? `${o.value.toFixed(2)}%` : o.value.toLocaleString();
          const change = o.change_pct;
          const tone =
            change === null
              ? "neutral"
              : isVix
              ? change > 0
                ? "warn"
                : change < 0
                ? "good"
                : "neutral"
              : isDxy
              ? change > 0
                ? "warn"
                : change < 0
                ? "good"
                : "neutral"
              : change > 0
              ? "good"
              : change < 0
              ? "warn"
              : "neutral";
          const ageMs = Date.now() - o.observed_at;
          return (
            <MetricTile
              key={o.series_id}
              label={o.label}
              source="FRED"
              ageMs={ageMs}
              // FRED publica no fim do dia útil ET; stale se > 3 dias (cobre fim de semana).
              stale={isStale(ageMs, 3 * 24 * 3600_000)}
              value={value}
              sub={
                change !== null
                  ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%`
                  : o.date
              }
              tone={tone}
            />
          );
        })}
        {orderedYahoo.map((q) => {
          const meta = YAHOO_LABELS[q.symbol];
          if (!meta) return null;
          const value =
            meta.kind === "yield" ? `${q.price.toFixed(2)}%` : q.price.toLocaleString();
          const tone =
            q.change_pct > 0 ? "good" : q.change_pct < 0 ? "warn" : "neutral";
          return (
            <MetricTile
              key={q.symbol}
              label={meta.label}
              source="Yahoo"
              // Yahoo quote é intraday; sem timestamp explícito, assumimos idade do fetch (~cache).
              ageMs={null}
              stale={false}
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
                      backgroundColor: isPos
                        ? "rgba(52, 211, 153, 0.5)"
                        : "rgba(248, 113, 113, 0.5)",
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
          {funding ? "Deribit OK" : "Deribit falhou"} ·{" "}
          {fred && fred.length > 0 ? `FRED ${fred.length}/${FRED_ORDER.length}` : "FRED falhou"} ·{" "}
          {yahoo && yahoo.length > 0 ? `Yahoo ${yahoo.length}/${YAHOO_ORDER.length}` : "Yahoo falhou"}{" "}
          · {fear_greed ? "F&G OK" : "F&G indisponível"} ·{" "}
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
  source,
  ageMs,
  stale,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "neutral";
  source?: string;
  ageMs?: number | null;
  stale?: boolean;
}) {
  const toneClass =
    tone === "good"
      ? "text-[var(--color-accent)]"
      : tone === "warn"
      ? "text-[var(--color-danger)]"
      : "text-[var(--color-text)]";
  const staleClass = stale ? "opacity-50" : "";
  // ageMs = idade "há X ms"; para formatar usamos um timestamp derivado.
  const formattedAge =
    ageMs !== null && ageMs !== undefined ? relativeAge(Date.now() - ageMs) : null;
  return (
    <div
      className={`card-muted p-2 ${staleClass}`}
      title={stale ? "Dado desatualizado" : undefined}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="text-[10px] text-[var(--color-text-subtle)] truncate">{label}</div>
        {source && (
          <div className="text-[9px] text-[var(--color-text-subtle)] opacity-70 shrink-0">
            {source}
          </div>
        )}
      </div>
      <div className={`font-semibold mt-0.5 ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{sub}</div>}
      {formattedAge && (
        <div className="text-[9px] text-[var(--color-text-subtle)] mt-0.5">há {formattedAge}</div>
      )}
    </div>
  );
}
