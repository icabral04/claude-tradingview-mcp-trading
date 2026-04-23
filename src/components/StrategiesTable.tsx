"use client";

import { memo } from "react";
import type { ScreenedTrade, StrategyId } from "@/lib/strategies/types";

interface Props {
  trades: ScreenedTrade[];
  btcPrice: number;
  onExecute: (trade: ScreenedTrade) => void;
  /** Quando true, exibe o nome da estratégia em chip ao lado das pernas. Útil ao misturar várias. */
  showStrategyLabel?: boolean;
}

const TYPE_BADGE: Record<string, string> = {
  put: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  call: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

const STRATEGY_LABEL: Record<StrategyId, string> = {
  "sell-put": "Sell Put",
  "sell-call": "Sell Call",
  "bull-put-spread": "Bull Put Spread",
  "bear-call-spread": "Bear Call Spread",
  "short-strangle": "Short Strangle",
  "iron-condor": "Iron Condor",
};

function formatLeg(leg: ScreenedTrade["legs"][number]): string {
  const dir = leg.direction === "sell" ? "−" : "+";
  return `${dir}${leg.option_type[0].toUpperCase()} $${leg.strike.toLocaleString()}`;
}

function formatBreakeven(values: number[]): string {
  return values.map((v) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`).join(" / ");
}

function formatSigned(value: number, decimals: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

function greekColor(value: number): string {
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-[var(--color-text-muted)]";
}

export const StrategiesTable = memo(function StrategiesTable({ trades, btcPrice, onExecute, showStrategyLabel = false }: Props) {
  if (trades.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">
        Nenhum trade passou pelos filtros. Ajuste delta/IV/DTE em <code>rules.json</code>.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs tabular font-mono">
        <thead>
          <tr className="text-[var(--color-text-subtle)] border-b border-[var(--color-border)]">
            <th className="text-left px-3 py-2 font-medium">Pernas</th>
            <th className="text-right px-2 py-2 font-medium">DTE</th>
            <th className="text-right px-2 py-2 font-medium">Crédito</th>
            <th className="text-right px-2 py-2 font-medium">Max loss</th>
            <th className="text-right px-2 py-2 font-medium">Breakeven</th>
            <th className="text-right px-2 py-2 font-medium" title="Probabilidade aproximada de profit">
              POP
            </th>
            <th className="text-right px-2 py-2 font-medium">R:R</th>
            <th className="text-right px-2 py-2 font-medium" title="ROI anualizado sobre margem estimada">
              ROI/yr
            </th>
            <th
              className="text-right px-2 py-2 font-medium"
              title="Gregas agregadas da posição (sell = −, buy = +). Delta direção · Gamma convexidade · Theta decaimento por dia · Vega sensibilidade a 1 vol point"
            >
              Gregas
            </th>
            <th className="text-right px-2 py-2 font-medium">Score</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t, i) => {
            const expiry = new Date(t.expiration_timestamp).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            });
            const usingMark = t.legs.some((l) => l.price_source === "mark");
            return (
              <tr
                key={i}
                className="border-b border-[var(--color-border)]/40 hover:bg-[var(--color-surface-2)]/50 transition-colors"
              >
                <td className="px-3 py-2.5">
                  {showStrategyLabel && (
                    <div className="text-[11px] font-semibold text-[var(--color-accent)] mb-1 tracking-tight">
                      {STRATEGY_LABEL[t.strategy]}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {t.legs.map((leg, j) => (
                      <span
                        key={j}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-semibold ${
                          TYPE_BADGE[leg.option_type]
                        }`}
                        title={`${leg.direction === "sell" ? "Vende" : "Compra"} ${leg.option_type.toUpperCase()} strike $${leg.strike} | Δ ${leg.delta.toFixed(3)} | IV ${leg.mark_iv.toFixed(1)}`}
                      >
                        {formatLeg(leg)}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px] text-[var(--color-text-subtle)] mt-1">
                    Venc {expiry}
                    {usingMark && (
                      <span className="ml-2 text-amber-400" title="Bid zerado, usando mark price">
                        ⚠ mark
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right px-2 py-2.5 text-[var(--color-text)]">{t.dte.toFixed(0)}d</td>
                <td className="text-right px-2 py-2.5 text-emerald-400 font-semibold">
                  ${t.credit_usd.toFixed(0)}
                  <div className="text-[11px] text-[var(--color-text-subtle)]">
                    {t.credit_btc.toFixed(5)} BTC
                  </div>
                </td>
                <td className="text-right px-2 py-2.5">
                  {t.max_loss_usd === null ? (
                    <span className="text-rose-400" title="Risco teoricamente ilimitado">∞</span>
                  ) : (
                    <span className="text-rose-300">${t.max_loss_usd.toFixed(0)}</span>
                  )}
                </td>
                <td className="text-right px-2 py-2.5 text-[var(--color-text-muted)]">
                  {formatBreakeven(t.breakeven_usd)}
                </td>
                <td className="text-right px-2 py-2.5 text-[var(--color-text)]">
                  {(t.pop * 100).toFixed(0)}%
                </td>
                <td className="text-right px-2 py-2.5 text-[var(--color-text-muted)]">
                  {t.risk_reward === null ? "—" : `${t.risk_reward.toFixed(1)}:1`}
                </td>
                <td className="text-right px-2 py-2.5">
                  {t.roi_annual_pct === null ? (
                    <span className="text-[var(--color-text-subtle)]">—</span>
                  ) : (
                    <span className="text-amber-300 font-semibold">{t.roi_annual_pct.toFixed(0)}%</span>
                  )}
                </td>
                <td className="text-right px-2 py-2.5">
                  <div
                    className="inline-grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-[11px] leading-tight"
                    title={`delta ${formatSigned(t.greeks.delta, 4)} · gamma ${formatSigned(t.greeks.gamma, 6)} · theta ${formatSigned(t.greeks.theta, 2)}/d · vega ${formatSigned(t.greeks.vega, 2)}`}
                  >
                    <span className="text-[var(--color-text-subtle)] text-left">delta</span>
                    <span className={greekColor(t.greeks.delta)}>{formatSigned(t.greeks.delta, 2)}</span>
                    <span className="text-[var(--color-text-subtle)] text-left">theta</span>
                    <span className={greekColor(t.greeks.theta)}>{formatSigned(t.greeks.theta, 1)}</span>
                    <span className="text-[var(--color-text-subtle)] text-left">vega</span>
                    <span className={greekColor(-t.greeks.vega)}>{formatSigned(t.greeks.vega, 1)}</span>
                  </div>
                </td>
                <td className="text-right px-2 py-2.5 text-[var(--color-accent)] font-semibold">
                  {t.score.toFixed(2)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    onClick={() => onExecute(t)}
                    className="btn btn-primary !py-1 !px-2.5 !text-[11px]"
                    title={`Executar ${STRATEGY_LABEL[t.strategy]}`}
                  >
                    Operar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 text-[11px] text-[var(--color-text-subtle)] px-3">
        Spot: ${btcPrice.toLocaleString()} · Crédito em USD = crédito BTC × spot · POP = 1 − Σ|Δ short|
      </div>
    </div>
  );
});
