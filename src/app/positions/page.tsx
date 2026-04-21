"use client";

import { useState, useEffect } from "react";
import { PositionsTable } from "@/components/PositionsTable";
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

  return (
    <div className="max-w-screen-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-wider" style={{ color: "var(--text)" }}>
          POSIÇÕES ABERTAS
        </h1>
        <button
          onClick={fetchPositions}
          disabled={loading}
          className="px-3 py-1 rounded text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          {loading ? "Atualizando..." : "ATUALIZAR"}
        </button>
      </div>

      {message && (
        <div
          className="rounded-lg px-4 py-3 text-sm font-mono"
          style={{
            background: message.startsWith("Erro") ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
            border: `1px solid ${message.startsWith("Erro") ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
            color: message.startsWith("Erro") ? "var(--red)" : "var(--green)",
          }}
        >
          {message}
        </div>
      )}

      {positions.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            {
              label: "P&L FLUTUANTE",
              value: `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(6)} BTC`,
              color: totalPnl >= 0 ? "var(--green)" : "var(--red)",
            },
            {
              label: "DELTA TOTAL",
              value: totalDelta.toFixed(4),
              color: Math.abs(totalDelta) < 0.1 ? "var(--green)" : "var(--yellow)",
            },
            {
              label: "POSIÇÕES",
              value: positions.length,
              color: "var(--text)",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-lg p-4"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
                {card.label}
              </p>
              <p className="text-xl font-bold" style={{ color: card.color }}>
                {card.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <div
        className="rounded-lg p-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {error ? (
          <p className="text-sm" style={{ color: "var(--red)" }}>
            {error}
          </p>
        ) : (
          <PositionsTable positions={positions} onClose={handleClose} />
        )}
      </div>
    </div>
  );
}
