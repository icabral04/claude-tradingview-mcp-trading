"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeribitAccountSummary, DeribitPosition } from "@/lib/deribit/types";

type AccountData = DeribitAccountSummary & { btc_price: number | null };

interface ScopeInfo {
  base_url: string;
  has_credentials: boolean;
  authenticated: boolean;
  scope: string;
  scopes: string[];
  can_read_account: boolean;
  can_trade: boolean;
  expires_in_sec: number;
  error?: string;
}

export function MyPositionsCard() {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [positions, setPositions] = useState<DeribitPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ScopeInfo | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);

  async function load() {
    try {
      const [accRes, posRes] = await Promise.all([
        fetch("/api/account"),
        fetch("/api/positions"),
      ]);
      const acc = await accRes.json();
      const pos = await posRes.json();
      if (acc.error) throw new Error(acc.error);
      if (pos.error) throw new Error(pos.error);
      setAccount(acc);
      setPositions(Array.isArray(pos) ? pos : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar conta");
    } finally {
      setLoading(false);
    }
  }

  async function diagnose() {
    setScopeLoading(true);
    try {
      const res = await fetch("/api/deribit-scope");
      const json = (await res.json()) as ScopeInfo;
      setScope(json);
    } catch (err) {
      setScope({
        base_url: "",
        has_credentials: false,
        authenticated: false,
        scope: "",
        scopes: [],
        can_read_account: false,
        can_trade: false,
        expires_in_sec: 0,
        error: err instanceof Error ? err.message : "Falha no diagnóstico",
      });
    } finally {
      setScopeLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return (
      <div className="card p-3 space-y-3 border-[rgba(248,113,113,0.3)]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="text-xs text-[var(--color-danger)] font-mono">
            Minha conta: {error}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={diagnose} disabled={scopeLoading} className="btn btn-ghost text-[11px]">
              {scopeLoading ? "…" : "Diagnosticar"}
            </button>
            <button onClick={load} className="btn btn-ghost text-[11px]">
              ↻
            </button>
          </div>
        </div>
        {scope && <ScopeDiagnosis info={scope} />}
      </div>
    );
  }
  if (loading && !account) {
    return (
      <div className="card p-4 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        Conectando à Deribit…
      </div>
    );
  }
  if (!account) return null;

  const btc = account.btc_price ?? 0;
  const equityUsd = account.equity * btc;
  const availUsd = account.available_funds * btc;
  const sessionPl = account.session_rpl + account.session_upl;
  const sessionPlUsd = sessionPl * btc;
  const totalPnl = positions.reduce((s, p) => s + p.floating_profit_loss, 0);
  const totalPnlUsd = totalPnl * btc;
  const totalValueUsd = positions.reduce(
    (s, p) => s + Math.abs(p.size) * p.mark_price * btc,
    0
  );
  const marginPct = account.equity > 0 ? (account.initial_margin / account.equity) * 100 : 0;

  return (
    <div className="card p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Minha conta Deribit</h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            Saldo, P&L da sessão e posições abertas · atualiza a cada 15s
          </p>
        </div>
        <Link href="/positions" className="btn btn-ghost text-[11px]">
          Ver detalhes →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular font-mono">
        <Tile
          label="Equity"
          btc={account.equity}
          usd={equityUsd}
        />
        <Tile
          label="Disponível"
          btc={account.available_funds}
          usd={availUsd}
          tone="accent"
        />
        <Tile
          label="P&L sessão"
          btc={sessionPl}
          usd={sessionPlUsd}
          signed
          tone={sessionPl >= 0 ? "good" : "warn"}
        />
        <Tile
          label={`Margem ${marginPct.toFixed(1)}%`}
          btc={account.initial_margin}
          usd={account.initial_margin * btc}
          tone={marginPct > 70 ? "warn" : marginPct > 40 ? "neutral" : "good"}
        />
      </div>

      {positions.length === 0 ? (
        <div className="card-muted p-3 text-center text-[11px] text-[var(--color-text-muted)]">
          Nenhuma posição aberta.
        </div>
      ) : (
        <div className="card-muted p-2 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--color-text-subtle)] uppercase tracking-wider font-semibold">
              {positions.length} posiç{positions.length === 1 ? "ão aberta" : "ões abertas"}
            </span>
            <span className="tabular font-mono text-[var(--color-text-muted)]">
              Valor: ${Math.round(totalValueUsd).toLocaleString()} ·{" "}
              <span style={{ color: totalPnl >= 0 ? "var(--color-accent)" : "var(--color-danger)" }}>
                P&L {totalPnl >= 0 ? "+" : ""}
                {totalPnl.toFixed(4)} BTC ({totalPnl >= 0 ? "+" : ""}$
                {Math.abs(totalPnlUsd).toFixed(0)})
              </span>
            </span>
          </div>
          <table className="w-full text-[10px] tabular font-mono">
            <thead>
              <tr className="text-[var(--color-text-subtle)] uppercase tracking-wider">
                <th className="text-left py-0.5">Instrumento</th>
                <th className="text-right px-2">Size</th>
                <th className="text-right px-2">Mark</th>
                <th className="text-right px-2">Valor USD</th>
                <th className="text-right px-2">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.slice(0, 8).map((p) => {
                const valueUsd = Math.abs(p.size) * p.mark_price * btc;
                const pnlUsd = p.floating_profit_loss * btc;
                const positive = p.floating_profit_loss >= 0;
                return (
                  <tr key={p.instrument_name} className="border-t border-[var(--color-border)]">
                    <td className="py-1 text-[var(--color-accent)] truncate max-w-[180px]">
                      {p.instrument_name}
                      <span
                        className={`ml-1 text-[9px] ${
                          p.direction === "sell"
                            ? "text-[var(--color-success)]"
                            : "text-[var(--color-danger)]"
                        }`}
                      >
                        {p.direction === "sell" ? "SHORT" : "LONG"}
                      </span>
                    </td>
                    <td className="text-right px-2 text-[var(--color-text-muted)]">{p.size}</td>
                    <td className="text-right px-2 text-[var(--color-text-muted)]">
                      {p.mark_price.toFixed(4)}
                    </td>
                    <td className="text-right px-2 text-[var(--color-text)]">
                      ${Math.round(valueUsd).toLocaleString()}
                    </td>
                    <td
                      className="text-right px-2 font-semibold"
                      style={{ color: positive ? "var(--color-accent)" : "var(--color-danger)" }}
                    >
                      {positive ? "+" : ""}
                      {p.floating_profit_loss.toFixed(4)}
                      <span className="ml-1 text-[var(--color-text-muted)] font-normal">
                        ({positive ? "+" : ""}${Math.abs(pnlUsd).toFixed(0)})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {positions.length > 8 && (
            <div className="text-[10px] text-[var(--color-text-muted)] text-center">
              +{positions.length - 8} posiç{positions.length - 8 === 1 ? "ão" : "ões"} —{" "}
              <Link href="/positions" className="text-[var(--color-accent)] hover:underline">
                ver todas
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  btc,
  usd,
  signed,
  tone,
}: {
  label: string;
  btc: number;
  usd: number;
  signed?: boolean;
  tone?: "good" | "warn" | "accent" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-[var(--color-accent)]"
      : tone === "warn"
      ? "text-[var(--color-danger)]"
      : tone === "accent"
      ? "text-[var(--color-accent)]"
      : "text-[var(--color-text)]";
  const prefix = signed ? (btc >= 0 ? "+" : "") : "";
  return (
    <div className="card-muted p-2">
      <div className="text-[10px] text-[var(--color-text-subtle)]">{label}</div>
      <div className={`font-semibold mt-0.5 ${toneClass}`}>
        {prefix}
        {btc.toFixed(4)} BTC
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
        {signed && usd >= 0 ? "+" : signed && usd < 0 ? "-" : ""}$
        {Math.abs(usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </div>
    </div>
  );
}

function ScopeDiagnosis({ info }: { info: ScopeInfo }) {
  const missing: string[] = [];
  if (!info.can_read_account) missing.push("account:read");
  if (!info.can_trade) missing.push("trade:read_write");

  return (
    <div className="card-muted p-3 space-y-2 text-[11px] tabular font-mono">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
        <Row k="Base URL" v={info.base_url || "—"} />
        <Row k="Credenciais" v={info.has_credentials ? "ok" : "faltando"} good={info.has_credentials} />
        <Row k="Autenticado" v={info.authenticated ? "sim" : "não"} good={info.authenticated} />
        <Row k="Expira em" v={info.expires_in_sec > 0 ? `${info.expires_in_sec}s` : "—"} />
        <Row k="account:read" v={info.can_read_account ? "✓" : "✗"} good={info.can_read_account} />
        <Row k="trade:read_write" v={info.can_trade ? "✓" : "✗"} good={info.can_trade} />
      </div>
      {info.scope && (
        <div>
          <div className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wider">
            Scope atual
          </div>
          <div className="text-[11px] text-[var(--color-text)] break-all">{info.scope}</div>
        </div>
      )}
      {info.error && (
        <div className="text-[var(--color-danger)]">Erro do auth: {info.error}</div>
      )}
      {missing.length > 0 && (
        <div className="text-[var(--color-warning)]">
          Faltando na API key: <strong>{missing.join(", ")}</strong>. Edite em Deribit → Account
          → API → Edit e marque as permissões.
        </div>
      )}
    </div>
  );
}

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  const color =
    good === true
      ? "var(--color-accent)"
      : good === false
      ? "var(--color-danger)"
      : "var(--color-text)";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-subtle)]">{k}</span>
      <span style={{ color }}>{v}</span>
    </div>
  );
}
