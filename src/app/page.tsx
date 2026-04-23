"use client";

import { useState, useCallback, useEffect } from "react";
import { OptionsContextCard } from "@/components/OptionsContextCard";
import { OptionsMetricsCard } from "@/components/OptionsMetricsCard";
import { OpenInterestPanel } from "@/components/OpenInterestPanel";
import { VolSurfacePanel } from "@/components/VolSurfacePanel";
import { PutStrikesPanel } from "@/components/PutStrikesPanel";
import { MacroCard } from "@/components/MacroCard";
import { StrategiesTable } from "@/components/StrategiesTable";
import type { ScreenedTrade, StrategyId, StrategyMeta } from "@/lib/strategies/types";

interface ScreeningResponse {
  strategy: StrategyId;
  strategy_meta: StrategyMeta;
  bias: "bullish" | "bearish" | "neutral";
  btc_price: number;
  screened_at: string;
  trades: ScreenedTrade[];
  stats: { total: number; filtered: number };
  error?: string;
}

const STRATEGY_GROUPS: Array<{
  label: string;
  primary?: boolean;
  options: Array<{ id: StrategyId; label: string; hint: string }>;
}> = [
  {
    label: "Venda de PUT (foco)",
    primary: true,
    options: [
      { id: "sell-put", label: "Sell Put", hint: "Bullish · risco no downside" },
      { id: "bull-put-spread", label: "Bull Put Spread", hint: "Bullish · risco limitado" },
    ],
  },
  {
    label: "Lado CALL",
    options: [
      { id: "sell-call", label: "Sell Call", hint: "Bearish · risco infinito upside" },
      { id: "bear-call-spread", label: "Bear Call Spread", hint: "Bearish · risco limitado" },
    ],
  },
  {
    label: "Neutras (lateral)",
    options: [
      { id: "short-strangle", label: "Short Strangle", hint: "2 pernas · risco bilateral" },
      { id: "iron-condor", label: "Iron Condor", hint: "4 pernas · risco limitado" },
    ],
  },
];

const ALL_STRATEGIES: StrategyId[] = [
  "sell-put",
  "sell-call",
  "bull-put-spread",
  "bear-call-spread",
  "short-strangle",
  "iron-condor",
];

interface BestPicksState {
  trades: ScreenedTrade[];
  btc_price: number;
  generated_at: string;
  failures: Array<{ strategy: StrategyId; error: string }>;
}

export default function DashboardPage() {
  const [strategy, setStrategy] = useState<StrategyId>("sell-put");
  const [response, setResponse] = useState<ScreeningResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderResult, setOrderResult] = useState<string | null>(null);
  const [bestPicks, setBestPicks] = useState<BestPicksState | null>(null);
  const [bestLoading, setBestLoading] = useState(false);

  const fetchScreening = useCallback(async (id: StrategyId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/screening?strategy=${id}`);
      const data = (await res.json()) as ScreeningResponse;
      if (data.error) throw new Error(data.error);
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar screening");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBestPicks = useCallback(async () => {
    setBestLoading(true);
    try {
      const results = await Promise.allSettled(
        ALL_STRATEGIES.map((id) =>
          fetch(`/api/screening?strategy=${id}`).then(async (r) => {
            const data = (await r.json()) as ScreeningResponse;
            if (data.error) throw new Error(data.error);
            return data;
          })
        )
      );
      const trades: ScreenedTrade[] = [];
      const failures: BestPicksState["failures"] = [];
      let btcPrice = 0;
      results.forEach((r, i) => {
        const id = ALL_STRATEGIES[i];
        if (r.status === "fulfilled") {
          btcPrice = r.value.btc_price || btcPrice;
          if (r.value.trades[0]) trades.push(r.value.trades[0]);
        } else {
          failures.push({ strategy: id, error: r.reason?.message ?? String(r.reason) });
        }
      });
      trades.sort((a, b) => b.score - a.score);
      setBestPicks({
        trades,
        btc_price: btcPrice,
        generated_at: new Date().toISOString(),
        failures,
      });
    } finally {
      setBestLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScreening(strategy);
  }, [strategy, fetchScreening]);

  const handleExecute = useCallback(async (trade: ScreenedTrade) => {
    try {
      const isMulti = trade.legs.length > 1;
      const body = isMulti
        ? {
            type: "limit",
            label: `${trade.strategy}-${Date.now()}`,
            legs: trade.legs.map((l) => ({
              instrument_name: l.instrument_name,
              direction: l.direction,
              amount: 1,
              price: l.price,
            })),
          }
        : {
            instrument_name: trade.legs[0].instrument_name,
            amount: 1,
            type: "limit",
            price: trade.legs[0].price,
            label: trade.strategy,
          };
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const ids = isMulti
        ? data.orders.map((o: { order: { order_id: string } }) => o.order.order_id).join(", ")
        : data.order?.order_id;
      setOrderResult(`Ordem(ns) enviada(s): ${ids}`);
      setTimeout(() => setOrderResult(null), 6000);
    } catch (err) {
      setOrderResult(`Erro: ${err instanceof Error ? err.message : "desconhecido"}`);
    }
  }, []);

  const isError = orderResult?.startsWith("Erro");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="eyebrow mb-1.5">Screener · Estratégias de venda de prêmio</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            Painel de opções BTC
          </h1>
        </div>
        {response && (
          <div className="chip chip-accent">
            <span>{response.strategy_meta.label} · {response.strategy_meta.bias}</span>
          </div>
        )}
      </header>

      <MacroCard />
      <OptionsContextCard />
      <OptionsMetricsCard />
      <VolSurfacePanel />
      <OpenInterestPanel />
      <PutStrikesPanel />

      {orderResult && (
        <div
          className={`card-muted px-4 py-3 text-sm font-mono flex items-center gap-2 ${
            isError ? "!border-[rgba(248,113,113,0.3)]" : "!border-[rgba(52,211,153,0.3)]"
          }`}
          style={{
            background: isError ? "var(--color-danger-soft)" : "var(--color-success-soft)",
            color: isError ? "var(--color-danger)" : "var(--color-success)",
          }}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isError ? "bg-[var(--color-danger)]" : "bg-[var(--color-success)]"
            }`}
          />
          {orderResult}
        </div>
      )}

      {bestPicks && (
        <section className="card p-5 space-y-3 border-[var(--color-accent)]/30">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="eyebrow mb-1">Top picks</p>
              <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
                Melhor oportunidade de cada estratégia
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Ordenado por score · BTC ${bestPicks.btc_price.toLocaleString()} ·{" "}
                {new Date(bestPicks.generated_at).toLocaleTimeString("pt-BR")}
              </p>
            </div>
            <button
              onClick={() => setBestPicks(null)}
              className="btn btn-ghost"
              title="Esconder seção"
            >
              Fechar
            </button>
          </div>
          {bestPicks.failures.length > 0 && (
            <div className="card-muted px-3 py-2 text-[11px] text-[var(--color-warning)] !border-[rgba(251,191,36,0.3)]">
              Falharam: {bestPicks.failures.map((f) => `${f.strategy} (${f.error})`).join(" · ")}
            </div>
          )}
          {bestPicks.trades.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
              Nenhuma estratégia retornou trades. Ajuste filtros em <code>rules.json</code>.
            </div>
          ) : (
            <StrategiesTable
              trades={bestPicks.trades}
              btcPrice={bestPicks.btc_price}
              onExecute={handleExecute}
              showStrategyLabel
            />
          )}
        </section>
      )}

      <section className="card p-5 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
              Estratégias disponíveis
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Cada estratégia tem perfil de risco e regime ideal próprios
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchBestPicks}
              disabled={bestLoading}
              className="btn btn-ghost"
              title="Roda screening em todas as 6 estratégias e exibe a melhor de cada"
            >
              {bestLoading ? (
                <>
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Varrendo
                </>
              ) : (
                "Top de cada estratégia"
              )}
            </button>
            <button
              onClick={() => fetchScreening(strategy)}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Buscando
                </>
              ) : (
                "Atualizar"
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {STRATEGY_GROUPS.map((group) => (
            <div
              key={group.label}
              className={`space-y-1.5 ${
                group.primary
                  ? "md:-m-px rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]/30 p-2"
                  : ""
              }`}
            >
              <p
                className={`text-[11px] uppercase tracking-wider font-semibold ${
                  group.primary ? "text-[var(--color-accent)]" : "text-[var(--color-text-subtle)]"
                }`}
              >
                {group.label}
              </p>
              {group.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setStrategy(opt.id)}
                  className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                    strategy === opt.id
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <div className="text-xs font-semibold text-[var(--color-text)]">{opt.label}</div>
                  <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{opt.hint}</div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {error && (
          <div className="card-muted px-3 py-2 text-xs text-[var(--color-danger)] !border-[rgba(248,113,113,0.3)]">
            {error}
          </div>
        )}

        {response && (
          <div className="flex items-center gap-5 text-xs text-[var(--color-text-muted)] py-2 border-t border-b border-[var(--color-border)] flex-wrap tabular font-mono">
            <Stat label="BTC" value={`$${response.btc_price.toLocaleString()}`} />
            <Stat label="Estratégia" value={response.strategy_meta.label} valueClass="text-[var(--color-accent)]" />
            <Stat label="Pernas/trade" value={String(response.strategy_meta.legs)} />
            <Stat label="Risco" value={response.strategy_meta.risk_profile} />
            <Stat
              label="Trades"
              value={`${response.trades.length} de ${response.stats.filtered} candidatos`}
              valueClass="text-[var(--color-success)]"
            />
            <span className="ml-auto">{new Date(response.screened_at).toLocaleTimeString("pt-BR")}</span>
          </div>
        )}

        {response && (
          <StrategiesTable
            trades={response.trades}
            btcPrice={response.btc_price}
            onExecute={handleExecute}
          />
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[var(--color-text-subtle)]">{label}:</span>
      <span className={valueClass ?? "text-[var(--color-text)]"}>{value}</span>
    </span>
  );
}
