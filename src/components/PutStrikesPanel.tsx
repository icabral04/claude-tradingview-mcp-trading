"use client";

import { useEffect, useMemo, useState } from "react";

interface PutRow {
  instrument_name: string;
  strike: number;
  distance_pct: number;
  delta: number;
  mark_iv: number;
  mark_price_btc: number;
  mark_price_usd: number;
  bid_price: number;
  ask_price: number;
  premium_usd: number;
  open_interest: number;
  price_source: "bid" | "mark";
}

interface ExpiryGroup {
  expiration_timestamp: number;
  dte: number;
  label: string;
  puts: PutRow[];
}

interface PutStrikesData {
  spot: number;
  fetched_at: string;
  expiries: ExpiryGroup[];
  error?: string;
}

export function PutStrikesPanel() {
  const [data, setData] = useState<PutStrikesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTs, setActiveTs] = useState<number | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ msg: string; error: boolean } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/put-strikes");
      const json = (await res.json()) as PutStrikesData;
      if (json.error) throw new Error(json.error);
      setData(json);
      if (json.expiries.length > 0 && activeTs === null) {
        setActiveTs(json.expiries[0].expiration_timestamp);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar strikes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const activeExpiry = useMemo(() => {
    if (!data || activeTs === null) return null;
    return data.expiries.find((e) => e.expiration_timestamp === activeTs) ?? data.expiries[0];
  }, [data, activeTs]);

  async function sellPut(row: PutRow) {
    setPlacing(row.instrument_name);
    setFlash(null);
    try {
      const price = row.bid_price > 0 ? row.bid_price : row.mark_price_btc;
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument_name: row.instrument_name,
          amount: 1,
          type: "limit",
          price,
          label: `put-${Date.now()}`,
        }),
      });
      const out = await res.json();
      if (out.error) throw new Error(out.error);
      const id = out.order?.order_id ?? "paper";
      setFlash({ msg: `Ordem enviada: ${row.instrument_name} @ ${price} BTC (${id})`, error: false });
    } catch (err) {
      setFlash({ msg: err instanceof Error ? err.message : "Erro", error: true });
    } finally {
      setPlacing(null);
      setTimeout(() => setFlash(null), 6000);
    }
  }

  if (error) {
    return <div className="card p-3 text-xs text-[var(--color-danger)]">Strikes PUT: {error}</div>;
  }
  if (!data && loading) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Carregando strikes de PUT…
      </div>
    );
  }
  if (!data || data.expiries.length === 0) return null;

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Strikes PUT — venda direta</h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            Strikes próximos do spot · escolha uma expiry e venda a put em um clique
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-[var(--color-text-muted)] tabular font-mono">
            Spot ${data.spot.toLocaleString()}
          </span>
          <button onClick={load} disabled={loading} className="btn btn-ghost text-[11px]">
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {data.expiries.map((e) => {
          const active = e.expiration_timestamp === (activeExpiry?.expiration_timestamp ?? -1);
          return (
            <button
              key={e.expiration_timestamp}
              onClick={() => setActiveTs(e.expiration_timestamp)}
              className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                active
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              {e.label} · {e.dte}d
            </button>
          );
        })}
      </div>

      {flash && (
        <div
          className={`text-[11px] px-3 py-2 rounded-md border font-mono ${
            flash.error
              ? "text-[var(--color-danger)] border-[rgba(248,113,113,0.3)] bg-[var(--color-danger-soft)]"
              : "text-[var(--color-success)] border-[rgba(52,211,153,0.3)] bg-[var(--color-success-soft)]"
          }`}
        >
          {flash.msg}
        </div>
      )}

      {activeExpiry && (
        <div className="overflow-x-auto -mx-3 px-3">
          <table className="w-full text-[11px] tabular font-mono">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                <th className="text-left py-1 pr-2">Strike</th>
                <th className="text-right px-2">Dist %</th>
                <th className="text-right px-2">Δ</th>
                <th className="text-right px-2">IV</th>
                <th className="text-right px-2">Bid / Ask (BTC)</th>
                <th className="text-right px-2">Prêmio USD</th>
                <th className="text-right px-2">OI</th>
                <th className="text-right pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {activeExpiry.puts.map((row) => {
                const isNearSpot = Math.abs(row.distance_pct) < 1;
                const deltaAbs = Math.abs(row.delta);
                return (
                  <tr
                    key={row.instrument_name}
                    className={`border-t border-[var(--color-border)] ${
                      isNearSpot ? "bg-[var(--color-warning)]/5" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-2 font-semibold text-[var(--color-text)]">
                      ${row.strike.toLocaleString()}
                    </td>
                    <td
                      className={`text-right px-2 ${
                        row.distance_pct < -3
                          ? "text-[var(--color-accent)]"
                          : row.distance_pct < 0
                          ? "text-[var(--color-text-muted)]"
                          : "text-[var(--color-warning)]"
                      }`}
                    >
                      {row.distance_pct > 0 ? "+" : ""}
                      {row.distance_pct}%
                    </td>
                    <td className="text-right px-2 text-[var(--color-text-muted)]">
                      {deltaAbs.toFixed(2)}
                    </td>
                    <td className="text-right px-2 text-[var(--color-text-muted)]">
                      {row.mark_iv}%
                    </td>
                    <td className="text-right px-2 text-[var(--color-text-muted)]">
                      {row.bid_price > 0 ? row.bid_price.toFixed(4) : "—"}
                      {" / "}
                      {row.ask_price > 0 ? row.ask_price.toFixed(4) : "—"}
                    </td>
                    <td className="text-right px-2 text-[var(--color-success)] font-semibold">
                      ${row.premium_usd.toLocaleString()}
                    </td>
                    <td className="text-right px-2 text-[var(--color-text-muted)]">
                      {row.open_interest}
                    </td>
                    <td className="text-right pl-2">
                      <button
                        onClick={() => sellPut(row)}
                        disabled={placing === row.instrument_name}
                        className="btn btn-ghost text-[10px] px-2 py-0.5"
                        title={`Vender PUT ${row.strike} @ ${row.bid_price || row.mark_price_btc} BTC`}
                      >
                        {placing === row.instrument_name ? "…" : "Vender"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
        <span>
          {activeExpiry?.puts.length ?? 0} strikes · faixa {activeExpiry?.puts[activeExpiry.puts.length - 1]?.strike.toLocaleString()} – {activeExpiry?.puts[0]?.strike.toLocaleString()}
        </span>
        <span>{new Date(data.fetched_at).toLocaleTimeString("pt-BR")}</span>
      </div>
    </div>
  );
}
