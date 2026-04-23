"use client";

import { useEffect, useState } from "react";
import { InfoButton } from "./InfoButton";

interface OiCell {
  call_oi: number;
  put_oi: number;
}

interface OiExpiry {
  expiration_timestamp: number;
  dte: number;
  label: string;
  total_oi: number;
  pcr_oi: number;
  max_pain: number | null;
  atm_iv: number | null;
}

interface OiPanelData {
  btc_price: number;
  fetched_at: string;
  strikes: number[];
  expiries: OiExpiry[];
  cells: OiCell[][];
  max_oi: number;
  top_put_wall: { strike: number; put_oi: number } | null;
  top_call_wall: { strike: number; call_oi: number } | null;
  error?: string;
}

function formatOi(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (v >= 1) return v.toFixed(0);
  if (v > 0) return v.toFixed(1);
  return "";
}

function cellColor(cell: OiCell, max: number): { bg: string; ring?: string } {
  const total = cell.call_oi + cell.put_oi;
  if (total === 0 || max === 0) return { bg: "transparent" };
  const intensity = Math.min(1, total / max);
  const alpha = 0.08 + intensity * 0.72;
  if (cell.put_oi > cell.call_oi) {
    return { bg: `rgba(248, 113, 113, ${alpha.toFixed(3)})` };
  }
  return { bg: `rgba(96, 165, 250, ${alpha.toFixed(3)})` };
}

export function OpenInterestPanel() {
  const [data, setData] = useState<OiPanelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/oi-panel");
      const json = (await res.json()) as OiPanelData;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar OI");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div className="card p-3 text-xs text-[var(--color-danger)]">
        OI panel: {error}
      </div>
    );
  }

  if (!data && loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Carregando Open Interest…
      </div>
    );
  }

  if (!data) return null;

  const spot = data.btc_price;
  const spotIdx = data.strikes.findIndex((s, i) => {
    if (i === data.strikes.length - 1) return true;
    return spot >= s && spot < data.strikes[i + 1];
  });

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Open Interest · strike × expiry
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              Azul = dominância de CALL · Vermelho = dominância de PUT · intensidade ∝ OI total
            </p>
          </div>
          <InfoButton
            title="Onde está o dinheiro"
            summary={
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>PUT wall</strong>: strike com maior OI em PUT. Atua como suporte
                  técnico — vender PUT acima dela costuma ser mais seguro.
                </li>
                <li>
                  <strong>CALL wall</strong>: teto psicológico onde market makers defendem;
                  vender CALL acima é mais seguro.
                </li>
                <li>
                  <strong>Max pain</strong>: strike que minimiza payoff dos compradores. BTC
                  tende a gravitar até ali no vencimento.
                </li>
                <li>
                  <strong>PCR &gt; 1</strong> = mais PUT que CALL. Pode indicar medo (sinal
                  contrarian) ou hedge real de institucional.
                </li>
                <li>
                  Células muito vermelhas abaixo do spot sinalizam posição grande em PUTs —
                  bom alvo pra vender com crowd.
                </li>
              </ul>
            }
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular font-mono">
          {data.top_put_wall && (
            <span className="text-[var(--color-danger)]">
              PUT wall ${data.top_put_wall.strike.toLocaleString()} ({formatOi(data.top_put_wall.put_oi)})
            </span>
          )}
          {data.top_call_wall && (
            <span className="text-[var(--color-accent)]">
              CALL wall ${data.top_call_wall.strike.toLocaleString()} ({formatOi(data.top_call_wall.call_oi)})
            </span>
          )}
          <button onClick={load} disabled={loading} className="btn btn-ghost text-[11px]">
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-3 px-3">
        <table className="text-[10px] tabular font-mono border-separate border-spacing-0 w-max">
          <thead>
            <tr>
              <th className="sticky left-0 bg-[var(--color-surface)] px-2 py-1 text-left text-[var(--color-text-subtle)] font-semibold z-10">
                Expiry
              </th>
              <th className="px-2 py-1 text-right text-[var(--color-text-subtle)] font-semibold">
                MaxPain
              </th>
              <th className="px-2 py-1 text-right text-[var(--color-text-subtle)] font-semibold">
                PCR
              </th>
              {data.strikes.map((k, i) => (
                <th
                  key={k}
                  className={`px-1 py-1 text-[9px] text-center font-semibold ${
                    i === spotIdx
                      ? "text-[var(--color-warning)] bg-[var(--color-warning)]/10"
                      : "text-[var(--color-text-subtle)]"
                  }`}
                >
                  {(k / 1000).toFixed(0)}k
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.expiries.map((exp, rowIdx) => (
              <tr key={exp.expiration_timestamp}>
                <td className="sticky left-0 bg-[var(--color-surface)] px-2 py-1 whitespace-nowrap text-[var(--color-text)] z-10">
                  <span className="font-semibold">{exp.label}</span>
                  <span className="ml-1 text-[var(--color-text-muted)]">{exp.dte}d</span>
                </td>
                <td className="px-2 py-1 text-right text-[var(--color-text-muted)]">
                  {exp.max_pain ? `${(exp.max_pain / 1000).toFixed(0)}k` : "—"}
                </td>
                <td
                  className={`px-2 py-1 text-right ${
                    exp.pcr_oi > 1
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-accent)]"
                  }`}
                >
                  {exp.pcr_oi ? exp.pcr_oi.toFixed(2) : "—"}
                </td>
                {data.cells[rowIdx].map((cell, colIdx) => {
                  const { bg } = cellColor(cell, data.max_oi);
                  const total = cell.call_oi + cell.put_oi;
                  const isMaxPain = exp.max_pain === data.strikes[colIdx];
                  return (
                    <td
                      key={colIdx}
                      className={`px-1 py-1 text-center min-w-[34px] ${
                        isMaxPain ? "ring-1 ring-inset ring-[var(--color-warning)]/60" : ""
                      }`}
                      style={{ backgroundColor: bg }}
                      title={`${data.strikes[colIdx]} · call ${formatOi(cell.call_oi)} · put ${formatOi(cell.put_oi)}`}
                    >
                      <span className={total > 0 ? "text-[var(--color-text)]" : "text-transparent"}>
                        {formatOi(total)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
        <span>
          Spot ${spot.toLocaleString()} · {data.expiries.length} expiries · {data.strikes.length} strikes
        </span>
        <span>{new Date(data.fetched_at).toLocaleTimeString("pt-BR")}</span>
      </div>
    </div>
  );
}
