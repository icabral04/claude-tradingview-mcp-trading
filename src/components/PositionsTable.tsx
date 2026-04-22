"use client";

import { useState } from "react";
import type { DeribitPosition } from "@/lib/deribit/types";

interface Props {
  positions: DeribitPosition[];
  onClose: (pos: DeribitPosition) => Promise<void>;
}

export function PositionsTable({ positions, onClose }: Props) {
  if (positions.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-surface-2)] mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-muted)]">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6v6H9z" />
          </svg>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">Nenhuma posição aberta.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-5">
      <table className="table-modern">
        <thead>
          <tr>
            <th>Instrumento</th>
            <th>Direção</th>
            <th>Tamanho</th>
            <th>Preço médio</th>
            <th>Mark</th>
            <th>P&L flutuante</th>
            <th>Delta</th>
            <th>Theta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <PositionRow key={pos.instrument_name} pos={pos} onClose={onClose} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PositionRow({ pos, onClose }: { pos: DeribitPosition; onClose: (p: DeribitPosition) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const pnlColor = pos.floating_profit_loss >= 0 ? "var(--color-success)" : "var(--color-danger)";
  const isSell = pos.direction === "sell";

  async function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Fechar posição ${pos.instrument_name}?`)) return;
    setLoading(true);
    try {
      await onClose(pos);
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr>
      <td className="font-mono text-[var(--color-accent)]">{pos.instrument_name}</td>
      <td>
        <span className={`chip ${isSell ? "chip-success" : "chip-danger"}`}>
          {pos.direction.toUpperCase()}
        </span>
      </td>
      <td className="tabular font-mono">{pos.size}</td>
      <td className="tabular font-mono">{pos.average_price.toFixed(4)}</td>
      <td className="tabular font-mono text-[var(--color-text-muted)]">{pos.mark_price.toFixed(4)}</td>
      <td className="tabular font-mono font-semibold" style={{ color: pnlColor }}>
        {pos.floating_profit_loss >= 0 ? "+" : ""}{pos.floating_profit_loss.toFixed(6)} BTC
      </td>
      <td className="tabular font-mono">{pos.delta.toFixed(4)}</td>
      <td className="tabular font-mono text-[var(--color-danger)]">{pos.theta.toFixed(4)}</td>
      <td>
        <button onClick={handleClose} disabled={loading} className="btn btn-danger !py-1 !px-3">
          {loading ? "..." : "Fechar"}
        </button>
      </td>
    </tr>
  );
}
