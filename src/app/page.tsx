"use client";

import { useState, useEffect, useCallback } from "react";
import { SignalBanner } from "@/components/SignalBanner";
import { OptionsContextCard } from "@/components/OptionsContextCard";
import { OptionsTable } from "@/components/OptionsTable";
import type { SignalEntry } from "@/lib/signal-store";
import type { ScreeningResult, ScreenedOption } from "@/lib/screening/types";

type Bias = "bullish" | "bearish" | "neutral";

const BIAS_LABELS: Record<Bias, string> = {
  bullish: "ALTISTA (PUTS)",
  bearish: "BAIXISTA (CALLS)",
  neutral: "NEUTRO (AMBOS)",
};

export default function DashboardPage() {
  const [signal, setSignal] = useState<SignalEntry | null>(null);
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualBias, setManualBias] = useState<Bias | null>(null);
  const [orderResult, setOrderResult] = useState<string | null>(null);

  async function fetchSignal() {
    const res = await fetch("/api/signal");
    const data = await res.json();
    setSignal(data.current);
  }

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

  useEffect(() => {
    fetchSignal();
    const interval = setInterval(fetchSignal, 10_000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wider" style={{ color: "var(--text)" }}>
          SCREENING · LEE LOWELL
        </h1>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Vender premium · Delta 0.15–0.25 · DTE 21–45
        </span>
      </div>

      <SignalBanner signal={signal} />

      <OptionsContextCard />

      {orderResult && (
        <div
          className="rounded-lg px-4 py-3 text-sm font-mono"
          style={{
            background: orderResult.startsWith("Erro") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
            border: `1px solid ${orderResult.startsWith("Erro") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
            color: orderResult.startsWith("Erro") ? "var(--red)" : "var(--green)",
          }}
        >
          {orderResult}
        </div>
      )}

      <div
        className="rounded-lg p-4 space-y-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-widest" style={{ color: "var(--text-muted)" }}>
            OPÇÕES FILTRADAS
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded overflow-hidden text-xs" style={{ border: "1px solid var(--border)" }}>
              {(["bullish", "bearish", "neutral"] as Bias[]).map((b) => (
                <button
                  key={b}
                  onClick={() => {
                    setManualBias(b);
                    fetchScreening(b);
                  }}
                  className="px-3 py-1 transition-colors"
                  style={{
                    background: manualBias === b ? "var(--surface-2)" : "transparent",
                    color: manualBias === b ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {BIAS_LABELS[b]}
                </button>
              ))}
            </div>
            <button
              onClick={() => fetchScreening()}
              disabled={loading}
              className="px-3 py-1 rounded text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--purple)", color: "white" }}
            >
              {loading ? "Buscando..." : "BUSCAR"}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--red)" }}>
            {error}
          </p>
        )}

        {screening && (
          <div className="flex items-center gap-4 text-xs pb-2" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            <span>
              BTC:{" "}
              <span style={{ color: "var(--text)" }}>
                ${screening.btc_price.toLocaleString()}
              </span>
            </span>
            <span>
              Sinal:{" "}
              <span style={{ color: "var(--purple)" }}>{screening.signal.toUpperCase()}</span>
            </span>
            <span>
              Alvo:{" "}
              <span style={{ color: "var(--text)" }}>
                {screening.option_type_target === "both" ? "CALLS + PUTS" : screening.option_type_target.toUpperCase() + "S"}
              </span>
            </span>
            <span>
              Encontradas:{" "}
              <span style={{ color: "var(--green)" }}>{screening.options.length}</span>
            </span>
            <span className="ml-auto">{new Date(screening.screened_at).toLocaleTimeString("pt-BR")}</span>
          </div>
        )}

        {screening ? (
          <OptionsTable
            options={screening.options}
            btcPrice={screening.btc_price}
            onSell={handleSell}
          />
        ) : (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
            Selecione o viés e clique em BUSCAR para rodar o screening.
          </p>
        )}
      </div>

      <div
        className="rounded-lg p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-xs font-bold tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
          WEBHOOK TRADINGVIEW
        </h2>
        <div className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
          <p>
            URL:{" "}
            <code style={{ color: "var(--purple)" }}>
              POST {typeof window !== "undefined" ? window.location.origin : ""}/api/webhook
            </code>
          </p>
          <pre
            className="mt-2 p-3 rounded text-xs overflow-x-auto"
            style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" }}
          >{`{
  "secret": "SEU_WEBHOOK_SECRET",
  "bias": "bullish",
  "ticker": "{{ticker}}",
  "timeframe": "{{interval}}",
  "price": {{close}},
  "indicators": { "rsi": {{plot_0}}, "ema": {{plot_1}} }
}`}</pre>
        </div>
      </div>
    </div>
  );
}
