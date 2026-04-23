"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { InfoButton } from "./InfoButton";

interface SmilePoint {
  strike: number;
  moneyness: number;
  iv: number;
}

interface VolExpiry {
  expiration_timestamp: number;
  dte: number;
  label: string;
  atm_iv: number | null;
  atm_strike: number | null;
  skew_25d: number | null;
  smile: SmilePoint[];
}

interface VolSurfaceData {
  btc_price: number;
  fetched_at: string;
  expiries: VolExpiry[];
  term_structure: Array<{ dte: number; label: string; atm_iv: number | null }>;
  error?: string;
}

const SMILE_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#22d3ee",
];

export function VolSurfacePanel() {
  const [data, setData] = useState<VolSurfaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/vol-surface");
      const json = (await res.json()) as VolSurfaceData;
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar vol surface");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const smileData = useMemo(() => {
    if (!data) return [];
    const xSet = new Set<number>();
    for (const exp of data.expiries) for (const p of exp.smile) xSet.add(p.moneyness);
    const xs = Array.from(xSet).sort((a, b) => a - b);
    return xs.map((m) => {
      const row: Record<string, number> = { moneyness: m };
      for (const exp of data.expiries) {
        const p = exp.smile.find((x) => x.moneyness === m);
        if (p) row[exp.label] = p.iv;
      }
      return row;
    });
  }, [data]);

  if (error) {
    return <div className="card p-3 text-xs text-[var(--color-danger)]">Vol surface: {error}</div>;
  }
  if (!data && loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Carregando vol surface…
      </div>
    );
  }
  if (!data) return null;

  const termData = data.term_structure
    .filter((t) => t.atm_iv !== null)
    .map((t) => ({ dte: t.dte, atm_iv: t.atm_iv, label: t.label }));

  const frontIv = termData[0]?.atm_iv ?? null;
  const backIv = termData[termData.length - 1]?.atm_iv ?? null;
  const contango = frontIv !== null && backIv !== null ? backIv - frontIv : null;

  return (
    <div className="card p-3 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Vol surface & term structure
            </h2>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
              IV ATM por expiry + smile OTM por strike
            </p>
          </div>
          <InfoButton
            title="Decida a maturidade"
            summary={
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Contango</strong> (IV longo &gt; curto) = mercado calmo; vender PUT
                  em maturidades maiores paga mais prêmio por theta.
                </li>
                <li>
                  <strong>Backwardation</strong> = medo no curto; prêmio gordo em PUTs
                  próximas — ótima entrada se bias for bullish.
                </li>
                <li>
                  <strong>Skew 25Δ positivo alto</strong> (put IV − call IV) = mercado paga
                  caro por proteção → bom momento pra vender PUT OTM.
                </li>
                <li>
                  <strong>ATM IV &gt; média histórica</strong> = prêmio rico. Cruze com o IV
                  rank do &#39;Mais contexto&#39; para confirmar.
                </li>
                <li>
                  Smile muito inclinado para baixo = cauda fat tail precificada — use spread,
                  não naked.
                </li>
              </ul>
            }
          />
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular font-mono">
          {contango !== null && (
            <span
              className={contango >= 0 ? "text-[var(--color-accent)]" : "text-[var(--color-danger)]"}
            >
              {contango >= 0 ? "Contango" : "Backwardation"} {contango.toFixed(1)}pp
            </span>
          )}
          <button onClick={load} disabled={loading} className="btn btn-ghost text-[11px]">
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card-muted p-2">
          <p className="eyebrow mb-1 text-[10px]">Term structure (ATM IV × DTE)</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={termData} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="dte"
                  tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                  label={{ value: "DTE", position: "insideBottom", offset: -4, fontSize: 10 }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                  domain={["auto", "auto"]}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    fontSize: 11,
                  }}
                  formatter={(v) => [`${v}%`, "ATM IV"]}
                  labelFormatter={(dte) => {
                    const entry = termData.find((t) => t.dte === dte);
                    return entry ? `${entry.label} (${dte}d)` : `${dte}d`;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="atm_iv"
                  stroke="#60a5fa"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#60a5fa" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-muted p-2">
          <p className="eyebrow mb-1 text-[10px]">Smile (IV × moneyness %)</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={smileData} margin={{ top: 6, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="moneyness"
                  tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                  unit="%"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-text-muted)" }}
                  domain={["auto", "auto"]}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface-2)",
                    border: "1px solid var(--color-border)",
                    fontSize: 11,
                  }}
                  formatter={(v) => [`${v}%`, "IV"]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {data.expiries.map((exp, i) => (
                  <Line
                    key={exp.expiration_timestamp}
                    type="monotone"
                    dataKey={exp.label}
                    stroke={SMILE_COLORS[i % SMILE_COLORS.length]}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-[11px] tabular font-mono">
        {data.expiries.map((exp) => (
          <div key={exp.expiration_timestamp} className="card-muted p-2">
            <div className="text-[10px] text-[var(--color-text-subtle)]">{exp.label}</div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-[var(--color-text)] font-semibold">
                {exp.atm_iv !== null ? `${exp.atm_iv}%` : "—"}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{exp.dte}d</span>
            </div>
            {exp.skew_25d !== null && (
              <div
                className={`text-[10px] mt-0.5 ${
                  exp.skew_25d > 0 ? "text-[var(--color-danger)]" : "text-[var(--color-accent)]"
                }`}
                title="IV put 25Δ − IV call 25Δ (aprox.); positivo = medo de queda"
              >
                skew {exp.skew_25d > 0 ? "+" : ""}
                {exp.skew_25d}pp
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
        <span>Spot ${data.btc_price.toLocaleString()}</span>
        <span>{new Date(data.fetched_at).toLocaleTimeString("pt-BR")}</span>
      </div>
    </div>
  );
}
