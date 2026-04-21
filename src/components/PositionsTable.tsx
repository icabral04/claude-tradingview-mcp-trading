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
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-muted)" }}>
        Nenhuma posição aberta.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            <th className="pb-2 pr-4">Instrumento</th>
            <th className="pb-2 pr-4">Direção</th>
            <th className="pb-2 pr-4">Tamanho</th>
            <th className="pb-2 pr-4">Preço Médio</th>
            <th className="pb-2 pr-4">Mark</th>
            <th className="pb-2 pr-4">P&L Float</th>
            <th className="pb-2 pr-4">Delta</th>
            <th className="pb-2 pr-4">Theta</th>
            <th className="pb-2" />
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
  const pnlColor = pos.floating_profit_loss >= 0 ? "var(--green)" : "var(--red)";

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
    <tr className="border-b" style={{ borderColor: "var(--border)" }}>
      <td className="py-2 pr-4 font-mono" style={{ color: "var(--purple)" }}>
        {pos.instrument_name}
      </td>
      <td className="py-2 pr-4" style={{ color: pos.direction === "sell" ? "var(--green)" : "var(--red)" }}>
        {pos.direction.toUpperCase()}
      </td>
      <td className="py-2 pr-4">{pos.size}</td>
      <td className="py-2 pr-4">{pos.average_price.toFixed(4)}</td>
      <td className="py-2 pr-4">{pos.mark_price.toFixed(4)}</td>
      <td className="py-2 pr-4 font-bold" style={{ color: pnlColor }}>
        {pos.floating_profit_loss >= 0 ? "+" : ""}{pos.floating_profit_loss.toFixed(6)} BTC
      </td>
      <td className="py-2 pr-4">{pos.delta.toFixed(4)}</td>
      <td className="py-2 pr-4" style={{ color: "var(--red)" }}>
        {pos.theta.toFixed(4)}
      </td>
      <td className="py-2">
        <button
          onClick={handleClose}
          disabled={loading}
          className="px-3 py-1 rounded text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: "rgba(239,68,68,0.15)", color: "var(--red)", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          {loading ? "..." : "FECHAR"}
        </button>
      </td>
    </tr>
  );
}
