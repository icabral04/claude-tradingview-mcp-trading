"use client";

import { useState } from "react";
import type { DeribitPosition } from "@/lib/deribit/types";

interface Props {
  positions: DeribitPosition[];
  btcPrice?: number | null;
  onClose: (pos: DeribitPosition) => Promise<void>;
}

interface ParsedInstrument {
  expiryLabel: string;
  expiryTs: number | null;
  dte: number | null;
  strike: number | null;
  type: "call" | "put" | null;
}

function parseInstrument(name: string): ParsedInstrument {
  const parts = name.split("-");
  if (parts.length < 4) {
    return { expiryLabel: "", expiryTs: null, dte: null, strike: null, type: null };
  }
  const [, dateStr, strikeStr, typeChar] = parts;
  const strike = parseInt(strikeStr, 10);
  const type = typeChar === "C" ? "call" : typeChar === "P" ? "put" : null;

  const m = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  let expiryTs: number | null = null;
  if (m) {
    const [, d, mo, y] = m;
    const monIdx = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(mo);
    if (monIdx >= 0) {
      expiryTs = Date.UTC(2000 + parseInt(y, 10), monIdx, parseInt(d, 10), 8, 0, 0);
    }
  }
  const dte = expiryTs ? Math.max(0, Math.round(((expiryTs - Date.now()) / (1000 * 60 * 60 * 24)) * 10) / 10) : null;

  return {
    expiryLabel: dateStr,
    expiryTs,
    dte,
    strike: Number.isFinite(strike) ? strike : null,
    type,
  };
}

export function PositionsTable({ positions, btcPrice, onClose }: Props) {
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
            <th>Tipo</th>
            <th>Dir</th>
            <th>Size</th>
            <th>Strike</th>
            <th>DTE</th>
            <th>Preço médio</th>
            <th>Mark</th>
            <th>Valor (USD)</th>
            <th>P&L BTC</th>
            <th>P&L USD</th>
            <th>Δ</th>
            <th>Θ</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <PositionRow key={pos.instrument_name} pos={pos} btcPrice={btcPrice ?? null} onClose={onClose} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PositionRow({
  pos,
  btcPrice,
  onClose,
}: {
  pos: DeribitPosition;
  btcPrice: number | null;
  onClose: (p: DeribitPosition) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const pnlColor = pos.floating_profit_loss >= 0 ? "var(--color-success)" : "var(--color-danger)";
  const isSell = pos.direction === "sell";
  const parsed = parseInstrument(pos.instrument_name);

  const pnlUsd = btcPrice ? pos.floating_profit_loss * btcPrice : null;
  // Valor da posição (absoluto) em USD: |size| × mark_price (BTC) × BTC USD
  const valueUsd = btcPrice ? Math.abs(pos.size) * pos.mark_price * btcPrice : null;

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

  const typeBadge = parsed.type === "put"
    ? "chip-danger"
    : parsed.type === "call"
    ? "chip-info"
    : "chip-info";

  return (
    <tr>
      <td className="font-mono text-[var(--color-accent)] text-xs">{pos.instrument_name}</td>
      <td>
        <span className={`chip ${typeBadge} text-[10px]`}>
          {parsed.type ? parsed.type.toUpperCase() : "—"}
        </span>
      </td>
      <td>
        <span className={`chip ${isSell ? "chip-success" : "chip-danger"} text-[10px]`}>
          {pos.direction.toUpperCase()}
        </span>
      </td>
      <td className="tabular font-mono">{pos.size}</td>
      <td className="tabular font-mono">
        {parsed.strike ? `$${parsed.strike.toLocaleString()}` : "—"}
      </td>
      <td className="tabular font-mono text-[var(--color-text-muted)]">
        {parsed.dte !== null ? `${parsed.dte}d` : "—"}
      </td>
      <td className="tabular font-mono">{pos.average_price.toFixed(4)}</td>
      <td className="tabular font-mono text-[var(--color-text-muted)]">{pos.mark_price.toFixed(4)}</td>
      <td className="tabular font-mono text-[var(--color-text-muted)]">
        {valueUsd !== null ? `$${Math.round(valueUsd).toLocaleString()}` : "—"}
      </td>
      <td className="tabular font-mono font-semibold" style={{ color: pnlColor }}>
        {pos.floating_profit_loss >= 0 ? "+" : ""}{pos.floating_profit_loss.toFixed(6)}
      </td>
      <td className="tabular font-mono font-semibold" style={{ color: pnlColor }}>
        {pnlUsd !== null
          ? `${pnlUsd >= 0 ? "+" : ""}$${Math.abs(pnlUsd).toFixed(2)}`
          : "—"}
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
