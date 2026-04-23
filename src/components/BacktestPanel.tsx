"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BacktestTrade {
  expiry_date: string;
  expiry_ts: number;
  entry_ts: number;
  s_open: number;
  s_close: number;
  iv_annual: number;
  strike: number;
  premium_usd: number;
  pnl_usd: number;
  roi_pct: number;
  won: boolean;
}

interface BacktestResult {
  fetched_at: string;
  trades: BacktestTrade[];
  summary: {
    count: number;
    win_rate: number;
    total_pnl_usd: number;
    avg_pnl_usd: number;
    avg_roi_pct: number;
    cumulative_roi_pct: number;
  };
  error?: string;
}

export function BacktestPanel() {
  const [data, setData] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backtest?n=12");
      const json = (await res.json()) as BacktestResult;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao rodar backtest");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return <div className="card p-3 text-xs text-[var(--color-danger)]">Backtest: {error}</div>;
  }
  if (!data && loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Rodando backtest (pode levar 10–20s)…
      </div>
    );
  }
  if (!data) return null;

  const chartData = [...data.trades].reverse().map((t) => ({
    date: t.expiry_date.slice(5),
    roi: t.roi_pct,
    won: t.won,
  }));

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Backtest · Sell PUT Δ~30 weekly (últimos {data.summary.count})
          </h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            Entrada 7d antes do expiry · strike via BS inverso · IV do DVOL · aproximação
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn btn-ghost text-[11px]">
          {loading ? "…" : "↻"}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular font-mono">
        <div className="card-muted p-2">
          <div className="text-[10px] text-[var(--color-text-subtle)]">Win rate</div>
          <div className="font-semibold mt-0.5 text-[var(--color-text)]">{data.summary.win_rate}%</div>
        </div>
        <div className="card-muted p-2">
          <div className="text-[10px] text-[var(--color-text-subtle)]">PnL total</div>
          <div
            className={`font-semibold mt-0.5 ${
              data.summary.total_pnl_usd >= 0
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-danger)]"
            }`}
          >
            ${data.summary.total_pnl_usd.toLocaleString()}
          </div>
        </div>
        <div className="card-muted p-2">
          <div className="text-[10px] text-[var(--color-text-subtle)]">ROI médio / trade</div>
          <div
            className={`font-semibold mt-0.5 ${
              data.summary.avg_roi_pct >= 0
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-danger)]"
            }`}
          >
            {data.summary.avg_roi_pct > 0 ? "+" : ""}
            {data.summary.avg_roi_pct}%
          </div>
        </div>
        <div className="card-muted p-2">
          <div className="text-[10px] text-[var(--color-text-subtle)]">ROI cumulativo</div>
          <div
            className={`font-semibold mt-0.5 ${
              data.summary.cumulative_roi_pct >= 0
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-danger)]"
            }`}
          >
            {data.summary.cumulative_roi_pct > 0 ? "+" : ""}
            {data.summary.cumulative_roi_pct}%
          </div>
        </div>
      </div>

      <div className="card-muted p-2">
        <p className="eyebrow mb-1 text-[10px]">ROI por expiry (%)</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--color-text-muted)" }} unit="%" />
              <Tooltip
                contentStyle={{
                  background: "var(--color-surface-2)",
                  border: "1px solid var(--color-border)",
                  fontSize: 11,
                }}
                formatter={(v) => [`${v}%`, "ROI"]}
              />
              <Bar dataKey="roi">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.won ? "#34d399" : "#f87171"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-[11px] text-[var(--color-text-muted)] select-none">
          Ver trades individuais
        </summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-[10px] tabular font-mono">
            <thead>
              <tr className="text-[var(--color-text-subtle)] uppercase tracking-wider">
                <th className="text-left py-1">Expiry</th>
                <th className="text-right px-2">S open</th>
                <th className="text-right px-2">Strike Δ30</th>
                <th className="text-right px-2">S close</th>
                <th className="text-right px-2">IV</th>
                <th className="text-right px-2">Prêmio</th>
                <th className="text-right px-2">PnL</th>
                <th className="text-right px-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {data.trades.map((t) => (
                <tr key={t.expiry_ts} className="border-t border-[var(--color-border)]">
                  <td className="py-1 text-[var(--color-text)]">{t.expiry_date}</td>
                  <td className="text-right px-2 text-[var(--color-text-muted)]">
                    ${t.s_open.toLocaleString()}
                  </td>
                  <td className="text-right px-2 text-[var(--color-text-muted)]">
                    ${t.strike.toLocaleString()}
                  </td>
                  <td className="text-right px-2 text-[var(--color-text-muted)]">
                    ${t.s_close.toLocaleString()}
                  </td>
                  <td className="text-right px-2 text-[var(--color-text-muted)]">{t.iv_annual}%</td>
                  <td className="text-right px-2 text-[var(--color-text)]">
                    ${t.premium_usd.toFixed(2)}
                  </td>
                  <td
                    className={`text-right px-2 font-semibold ${
                      t.won ? "text-[var(--color-accent)]" : "text-[var(--color-danger)]"
                    }`}
                  >
                    {t.pnl_usd > 0 ? "+" : ""}${t.pnl_usd.toFixed(2)}
                  </td>
                  <td
                    className={`text-right px-2 ${
                      t.won ? "text-[var(--color-accent)]" : "text-[var(--color-danger)]"
                    }`}
                  >
                    {t.roi_pct > 0 ? "+" : ""}
                    {t.roi_pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="text-[10px] text-[var(--color-text-muted)]">
        {new Date(data.fetched_at).toLocaleString("pt-BR")}
      </div>
    </div>
  );
}
