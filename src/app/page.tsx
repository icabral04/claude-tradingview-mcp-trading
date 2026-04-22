"use client";

import { useState, useCallback } from "react";
import { OptionsContextCard } from "@/components/OptionsContextCard";
import { OptionsMetricsCard } from "@/components/OptionsMetricsCard";
import { OptionsTable } from "@/components/OptionsTable";
import type { ScreeningResult, ScreenedOption } from "@/lib/screening/types";

type Bias = "bullish" | "bearish" | "neutral";

const BIAS_LABELS: Record<Bias, string> = {
  bullish: "ALTISTA · PUTS",
  bearish: "BAIXISTA · CALLS",
  neutral: "NEUTRO · AMBOS",
};

export default function DashboardPage() {
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualBias, setManualBias] = useState<Bias | null>(null);
  const [orderResult, setOrderResult] = useState<string | null>(null);

  const fetchScreening = useCallback(
    async (biaOverride?: Bias) => {
      setLoading(true);
      setError(null);
      try {
        const bias = biaOverride ?? manualBias ?? undefined;
        const url = bias ? `/api/screening?bias=${bias}` : "/api/screening";
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setScreening(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao buscar screening");
      } finally {
        setLoading(false);
      }
    },
    [manualBias]
  );

  async function handleSell(opt: ScreenedOption) {
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_name: opt.instrument_name,
          amount: 1,
          type: "limit",
          price: opt.bid_price,
          label: "lee-lowell",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOrderResult(`Ordem enviada: ${data.order?.order_id ?? "OK"}`);
      setTimeout(() => setOrderResult(null), 5000);
    } catch (err) {
      setOrderResult(`Erro: ${err instanceof Error ? err.message : "desconhecido"}`);
    }
  }

  const isError = orderResult?.startsWith("Erro");

  return (
    <div className="space-y-6">
      {/* Page header */}
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="eyebrow mb-1.5">Screening · Lee Lowell</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            Painel de opções BTC
          </h1>
        </div>
        <div className="chip chip-accent">
          <span>Vender premium · Δ 0.15–0.25 · DTE 21–45</span>
        </div>
      </header>

      <OptionsContextCard />

      <OptionsMetricsCard />

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
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isError ? "bg-[var(--color-danger)]" : "bg-[var(--color-success)]"}`} />
          {orderResult}
        </div>
      )}

      {/* Screening panel */}
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
              Opções filtradas
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Resultados alinhados ao viés selecionado
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="segmented">
              {(["bullish", "bearish", "neutral"] as Bias[]).map((b) => (
                <button
                  key={b}
                  data-active={manualBias === b}
                  onClick={() => {
                    setManualBias(b);
                    fetchScreening(b);
                  }}
                >
                  {BIAS_LABELS[b]}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchScreening()}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Buscando
                </>
              ) : (
                "Buscar"
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="card-muted px-3 py-2 text-xs text-[var(--color-danger)] border-[rgba(248,113,113,0.3)]!">
            {error}
          </div>
        )}

        {screening && (
          <div className="flex items-center gap-5 text-xs text-[var(--color-text-muted)] pb-3 border-b border-[var(--color-border)] flex-wrap tabular font-mono">
            <Stat label="BTC" value={`$${screening.btc_price.toLocaleString()}`} />
            <Stat label="Sinal" value={screening.signal.toUpperCase()} valueClass="text-[var(--color-accent)]" />
            <Stat
              label="Alvo"
              value={screening.option_type_target === "both" ? "CALLS + PUTS" : screening.option_type_target.toUpperCase() + "S"}
            />
            <Stat
              label="Encontradas"
              value={String(screening.options.length)}
              valueClass="text-[var(--color-success)]"
            />
            <span className="ml-auto">
              {new Date(screening.screened_at).toLocaleTimeString("pt-BR")}
            </span>
          </div>
        )}

        {screening ? (
          <OptionsTable options={screening.options} btcPrice={screening.btc_price} onSell={handleSell} />
        ) : (
          <div className="py-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-surface-2)] mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-muted)]">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Selecione o viés e clique em{" "}
              <span className="text-[var(--color-text)] font-medium">Buscar</span> para rodar o screening
            </p>
          </div>
        )}
      </section>

    </div>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[var(--color-text-subtle)]">{label}:</span>
      <span className={valueClass ?? "text-[var(--color-text)]"}>{value}</span>
    </span>
  );
}
