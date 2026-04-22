"use client";

import { useState, useEffect } from "react";
import { PositionsTable } from "@/components/PositionsTable";
import { AccountSummary } from "@/components/AccountSummary";
import type { DeribitPosition } from "@/lib/deribit/types";

export default function PositionsPage() {
  const [positions, setPositions] = useState<DeribitPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchPositions() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/positions");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPositions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar posições");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 15_000);
    return () => clearInterval(interval);
  }, []);

  async function handleClose(pos: DeribitPosition) {
    try {
      const res = await fetch("/api/orders/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_name: pos.instrument_name,
          amount: Math.abs(pos.size),
          type: "market",
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessage(`Posição fechada: ${pos.instrument_name}`);
      setTimeout(() => setMessage(null), 4000);
      await fetchPositions();
    } catch (err) {
      setMessage(`Erro: ${err instanceof Error ? err.message : "desconhecido"}`);
    }
  }

  const totalPnl = positions.reduce((sum, p) => sum + p.floating_profit_loss, 0);
  const totalDelta = positions.reduce((sum, p) => sum + p.delta, 0);
  const isErrorMsg = message?.startsWith("Erro");

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="eyebrow mb-1.5">Carteira</p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">
            Posições abertas
          </h1>
        </div>
        <button onClick={fetchPositions} disabled={loading} className="btn btn-ghost">
          {loading ? (
            <>
              <span className="inline-block w-3 h-3 rounded-full border-2 border-current/30 border-t-current animate-spin" />
              Atualizando
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
              </svg>
              Atualizar
            </>
          )}
        </button>
      </header>

      <AccountSummary />

      {message && (
        <div
          className="card-muted px-4 py-3 text-sm font-mono flex items-center gap-2"
          style={{
            background: isErrorMsg ? "var(--color-danger-soft)" : "var(--color-success-soft)",
            borderColor: isErrorMsg ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.3)",
            color: isErrorMsg ? "var(--color-danger)" : "var(--color-success)",
          }}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${isErrorMsg ? "bg-[var(--color-danger)]" : "bg-[var(--color-success)]"}`} />
          {message}
        </div>
      )}

      {positions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="P&L flutuante"
            value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(6)} BTC`}
            tone={totalPnl >= 0 ? "success" : "danger"}
            hint={totalPnl >= 0 ? "Em lucro" : "Em prejuízo"}
          />
          <SummaryCard
            label="Delta total"
            value={totalDelta.toFixed(4)}
            tone={Math.abs(totalDelta) < 0.1 ? "success" : "warning"}
            hint={Math.abs(totalDelta) < 0.1 ? "Neutro" : "Exposto"}
          />
          <SummaryCard
            label="Posições"
            value={String(positions.length)}
            tone="default"
            hint={positions.length === 1 ? "ativa" : "ativas"}
          />
        </div>
      )}

      <section className="card p-5">
        {error ? (
          <p className="text-sm text-[var(--color-danger)]">{error}</p>
        ) : loading && positions.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <PositionsTable positions={positions} onClose={handleClose} />
        )}
      </section>
    </div>
  );
}

type Tone = "success" | "danger" | "warning" | "default";

function SummaryCard({ label, value, tone, hint }: { label: string; value: string; tone: Tone; hint?: string }) {
  const toneColor = {
    success: "var(--color-success)",
    danger: "var(--color-danger)",
    warning: "var(--color-warning)",
    default: "var(--color-text)",
  }[tone];

  return (
    <div className="card p-5">
      <p className="eyebrow mb-2">{label}</p>
      <p className="text-2xl font-semibold tabular font-mono tracking-tight" style={{ color: toneColor }}>
        {value}
      </p>
      {hint && (
        <p className="text-xs text-[var(--color-text-subtle)] mt-1">{hint}</p>
      )}
    </div>
  );
}
