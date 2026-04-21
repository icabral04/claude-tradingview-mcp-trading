"use client";

import { useState } from "react";
import type { ScreenedOption } from "@/lib/screening/types";

interface Props {
  options: ScreenedOption[];
  btcPrice: number;
  onSell: (opt: ScreenedOption) => void;
}

function fmtDelta(d: number) {
  return d.toFixed(3);
}

function fmtBtc(v: number) {
  return v.toFixed(4);
}

export function OptionsTable({ options, btcPrice, onSell }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  if (options.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: "var(--text-muted)" }}>
        Nenhuma opção passou no filtro. Ajuste os parâmetros em{" "}
        <code>rules.json</code>.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
            <th className="pb-2 pr-4">Instrumento</th>
            <th className="pb-2 pr-4">Strike</th>
            <th className="pb-2 pr-4">DTE</th>
            <th className="pb-2 pr-4">IV%</th>
            <th className="pb-2 pr-4">Delta</th>
            <th className="pb-2 pr-4">Theta/dia</th>
            <th className="pb-2 pr-4">Bid</th>
            <th className="pb-2 pr-4">Mark</th>
            <th className="pb-2 pr-4">OTM%</th>
            <th className="pb-2 pr-4">Target 50%</th>
            <th className="pb-2 pr-4">OI</th>
            <th className="pb-2">Score</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {options.map((opt) => {
            const isSelected = selected === opt.instrument_name;
            const isPut = opt.option_type === "put";
            return (
              <tr
                key={opt.instrument_name}
                className="border-b cursor-pointer transition-colors"
                style={{
                  borderColor: "var(--border)",
                  background: isSelected ? "var(--surface-2)" : "transparent",
                }}
                onClick={() => setSelected(isSelected ? null : opt.instrument_name)}
              >
                <td className="py-2 pr-4 font-mono" style={{ color: isPut ? "var(--green)" : "var(--red)" }}>
                  {opt.instrument_name}
                </td>
                <td className="py-2 pr-4">${opt.strike.toLocaleString()}</td>
                <td className="py-2 pr-4">{opt.dte}d</td>
                <td className="py-2 pr-4" style={{ color: opt.mark_iv > 80 ? "var(--green)" : "var(--text)" }}>
                  {opt.mark_iv}%
                </td>
                <td className="py-2 pr-4">{fmtDelta(opt.delta)}</td>
                <td className="py-2 pr-4" style={{ color: "var(--red)" }}>
                  {opt.theta.toFixed(4)}
                </td>
                <td className="py-2 pr-4">{fmtBtc(opt.bid_price)}</td>
                <td className="py-2 pr-4">{fmtBtc(opt.mark_price)}</td>
                <td className="py-2 pr-4">{opt.otm_pct}%</td>
                <td className="py-2 pr-4" style={{ color: "var(--green)" }}>
                  {fmtBtc(opt.profit_target)}
                </td>
                <td className="py-2 pr-4">{opt.open_interest.toLocaleString()}</td>
                <td className="py-2 pr-4">
                  <span
                    className="text-xs font-bold"
                    style={{ color: opt.score > 0.7 ? "var(--green)" : opt.score > 0.5 ? "var(--yellow)" : "var(--text-muted)" }}
                  >
                    {opt.score}
                  </span>
                </td>
                <td className="py-2">
                  <SellButton opt={opt} onSell={onSell} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SellButton({ opt, onSell }: { opt: ScreenedOption; onSell: (o: ScreenedOption) => void }) {
  const [loading, setLoading] = useState(false);

  async function handleSell(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Vender 1x ${opt.instrument_name} a ${opt.bid_price.toFixed(4)} BTC?`)) return;
    setLoading(true);
    try {
      onSell(opt);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSell}
      disabled={loading}
      className="px-3 py-1 rounded text-xs font-bold transition-opacity hover:opacity-80 disabled:opacity-40"
      style={{ background: "var(--purple)", color: "white" }}
    >
      {loading ? "..." : "VENDER"}
    </button>
  );
}
