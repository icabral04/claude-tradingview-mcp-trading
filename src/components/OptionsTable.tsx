"use client";

import { useMemo, useState } from "react";
import type { ScreenedOption } from "@/lib/screening/types";

interface Props {
  options: ScreenedOption[];
  btcPrice: number;
  onSell: (opt: ScreenedOption) => void;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtBtc = (v: number) => v.toFixed(4);
const fmtUsd = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtUsdSmall = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function fmtExpiry(ts: number): { date: string; weekday: string } {
  const d = new Date(ts);
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }).replace(".", "");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return { date, weekday };
}

function scoreTone(score: number) {
  if (score > 0.7) return { chip: "chip-success" };
  if (score > 0.5) return { chip: "chip-warning" };
  return { chip: "chip-info" };
}

// ── Derived metrics per option ────────────────────────────────────────────────

function deriveMetrics(opt: ScreenedOption, btcPrice: number) {
  // Premium (recebido ao vender, em BTC e USD)
  const premiumBtc = opt.bid_price;
  const premiumUsd = premiumBtc * btcPrice;

  // Spread bid/ask (em BTC)
  const spreadBtc = Math.max(0, opt.ask_price - opt.bid_price);
  const spreadPct = opt.mark_price > 0 ? (spreadBtc / opt.mark_price) * 100 : 0;

  // Breakeven ao VENDER premium
  // Sell PUT: BE = strike - premium_usd (premium em USD ~= premium_btc * btc_price)
  // Sell CALL: BE = strike + premium_usd
  const premiumUsdPerContract = premiumBtc * btcPrice;
  const breakeven =
    opt.option_type === "put"
      ? opt.strike - premiumUsdPerContract
      : opt.strike + premiumUsdPerContract;

  // POP (probability of profit) via |delta| → aprox. P(ITM). POP ≈ 1 - |delta|
  const pop = Math.max(0, Math.min(1, 1 - Math.abs(opt.delta))) * 100;

  // Max profit para vendedor = prêmio recebido
  const maxProfitUsd = premiumUsd;
  const maxLossUsd = opt.option_type === "put" ? Math.max(0, opt.strike - premiumUsdPerContract) : Infinity;

  // ROI naïve (strike como collateral, superestima pesado)
  const roiNaive =
    opt.dte > 0 ? (premiumUsdPerContract / opt.strike) * (365 / opt.dte) * 100 : 0;

  // ROI real via Deribit (margem inicial exigida). Preferir sempre que disponível.
  const roiAnnual = opt.roi_real ?? roiNaive;

  // Margem em USD (margin_sell em BTC × preço BTC)
  const marginUsd = opt.margin_sell !== null ? opt.margin_sell * btcPrice : null;

  return {
    premiumBtc,
    premiumUsd,
    spreadBtc,
    spreadPct,
    breakeven,
    pop,
    maxProfitUsd,
    maxLossUsd,
    roiAnnual,
    roiNaive,
    roiIsReal: opt.roi_real !== null,
    marginBtc: opt.margin_sell,
    marginUsd,
  };
}

// ── Group by expiration ───────────────────────────────────────────────────────

function groupByExpiry(options: ScreenedOption[]) {
  const groups = new Map<number, ScreenedOption[]>();
  for (const opt of options) {
    const arr = groups.get(opt.expiration_timestamp) ?? [];
    arr.push(opt);
    groups.set(opt.expiration_timestamp, arr);
  }
  // ordenar vencimentos do mais próximo ao mais distante
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([ts, opts]) => ({
      timestamp: ts,
      options: opts.sort((a, b) => b.score - a.score),
    }));
}

// ── Main component ────────────────────────────────────────────────────────────

export function OptionsTable({ options, btcPrice, onSell }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<"flat" | "expiry">("expiry");

  const grouped = useMemo(() => groupByExpiry(options), [options]);

  if (options.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[var(--color-surface-2)] mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--color-text-muted)]">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Nenhuma opção passou no filtro. Ajuste os parâmetros em{" "}
          <code className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-accent)]">
            rules.json
          </code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex items-center justify-between text-xs">
        <div className="text-[var(--color-text-muted)]">
          <span className="text-[var(--color-text)] font-semibold">{options.length}</span> opções ·{" "}
          <span className="text-[var(--color-text)] font-semibold">{grouped.length}</span> vencimentos
        </div>
        <div className="segmented">
          <button data-active={groupMode === "expiry"} onClick={() => setGroupMode("expiry")}>
            Por vencimento
          </button>
          <button data-active={groupMode === "flat"} onClick={() => setGroupMode("flat")}>
            Lista única
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-5 border-y border-[var(--color-border)]">
        <table className="table-modern min-w-[1200px]">
          <thead>
            <tr>
              <th>Instrumento</th>
              <th className="text-right">Strike</th>
              <th>Vencimento</th>
              <th className="text-right">DTE</th>
              <th className="text-right">OTM%</th>
              <th className="text-right">IV</th>
              <th className="text-right">Δ</th>
              <th className="text-right">Γ</th>
              <th className="text-right">Θ/dia</th>
              <th className="text-right">V</th>
              <th className="text-right">Bid</th>
              <th className="text-right">Ask</th>
              <th className="text-right">Prêmio $</th>
              <th className="text-right">Breakeven</th>
              <th className="text-right">POP</th>
              <th className="text-right">Margem</th>
              <th className="text-right">ROIa</th>
              <th className="text-right">OI</th>
              <th>Score</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groupMode === "expiry"
              ? grouped.map((g) => (
                  <ExpiryGroup
                    key={g.timestamp}
                    timestamp={g.timestamp}
                    options={g.options}
                    btcPrice={btcPrice}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    onSell={onSell}
                  />
                ))
              : options.map((opt) => (
                  <OptionRow
                    key={opt.instrument_name}
                    opt={opt}
                    btcPrice={btcPrice}
                    expanded={expanded === opt.instrument_name}
                    onToggle={() =>
                      setExpanded(expanded === opt.instrument_name ? null : opt.instrument_name)
                    }
                    onSell={onSell}
                  />
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Group header + rows ───────────────────────────────────────────────────────

function ExpiryGroup({
  timestamp,
  options,
  btcPrice,
  expanded,
  setExpanded,
  onSell,
}: {
  timestamp: number;
  options: ScreenedOption[];
  btcPrice: number;
  expanded: string | null;
  setExpanded: (v: string | null) => void;
  onSell: (opt: ScreenedOption) => void;
}) {
  const { date, weekday } = fmtExpiry(timestamp);
  const dte = Math.round((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
  const avgIv = options.reduce((sum, o) => sum + o.mark_iv, 0) / options.length;

  return (
    <>
      <tr>
        <td colSpan={20} className="!py-2 !px-3 !bg-[var(--color-surface-2)] border-y border-[var(--color-border)]">
          <div className="flex items-center gap-3 text-xs">
            <span className="chip chip-accent font-mono tabular">{date}</span>
            <span className="text-[var(--color-text-muted)] capitalize">{weekday}</span>
            <span className="text-[var(--color-text-subtle)]">·</span>
            <span className="text-[var(--color-text-muted)]">
              <span className="text-[var(--color-text)] font-semibold tabular">{dte}</span> dias
            </span>
            <span className="text-[var(--color-text-subtle)]">·</span>
            <span className="text-[var(--color-text-muted)]">
              IV média <span className="text-[var(--color-text)] tabular font-mono">{avgIv.toFixed(1)}%</span>
            </span>
            <span className="text-[var(--color-text-subtle)]">·</span>
            <span className="text-[var(--color-text-muted)]">
              <span className="text-[var(--color-text)] font-semibold tabular">{options.length}</span>{" "}
              {options.length === 1 ? "opção" : "opções"}
            </span>
          </div>
        </td>
      </tr>
      {options.map((opt) => (
        <OptionRow
          key={opt.instrument_name}
          opt={opt}
          btcPrice={btcPrice}
          expanded={expanded === opt.instrument_name}
          onToggle={() =>
            setExpanded(expanded === opt.instrument_name ? null : opt.instrument_name)
          }
          onSell={onSell}
          hideExpiry
        />
      ))}
    </>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function OptionRow({
  opt,
  btcPrice,
  expanded,
  onToggle,
  onSell,
  hideExpiry = false,
}: {
  opt: ScreenedOption;
  btcPrice: number;
  expanded: boolean;
  onToggle: () => void;
  onSell: (opt: ScreenedOption) => void;
  hideExpiry?: boolean;
}) {
  const isPut = opt.option_type === "put";
  const m = deriveMetrics(opt, btcPrice);
  const tone = scoreTone(opt.score);
  const { date, weekday } = fmtExpiry(opt.expiration_timestamp);

  return (
    <>
      <tr
        data-selected={expanded}
        className="cursor-pointer"
        onClick={onToggle}
      >
        <td className="font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${isPut ? "bg-[var(--color-success)]" : "bg-[var(--color-danger)]"}`}
              title={isPut ? "PUT" : "CALL"}
            />
            <span className="text-[var(--color-text)] text-xs">{opt.instrument_name}</span>
            <span
              className={`chip ${isPut ? "chip-success" : "chip-danger"} !px-1.5 !py-0 !text-[10px]`}
            >
              {isPut ? "PUT" : "CALL"}
            </span>
          </div>
        </td>
        <td className="tabular font-mono text-right">{fmtUsd(opt.strike)}</td>
        {!hideExpiry ? (
          <td>
            <div className="text-xs font-mono tabular text-[var(--color-text)]">{date}</div>
            <div className="text-[10px] text-[var(--color-text-subtle)] capitalize">{weekday}</div>
          </td>
        ) : (
          <td className="text-[var(--color-text-subtle)] text-xs">—</td>
        )}
        <td className="tabular font-mono text-right text-[var(--color-text-muted)]">{opt.dte}d</td>
        <td className="tabular font-mono text-right">{opt.otm_pct}%</td>
        <td
          className="tabular font-mono text-right"
          style={{ color: opt.mark_iv > 80 ? "var(--color-success)" : "var(--color-text)" }}
        >
          {opt.mark_iv}%
        </td>
        <td className="tabular font-mono text-right">{opt.delta.toFixed(3)}</td>
        <td className="tabular font-mono text-right text-[var(--color-text-muted)]">
          {opt.gamma.toFixed(5)}
        </td>
        <td className="tabular font-mono text-right text-[var(--color-danger)]">
          {opt.theta.toFixed(4)}
        </td>
        <td className="tabular font-mono text-right text-[var(--color-text-muted)]">
          {opt.vega.toFixed(3)}
        </td>
        <td className="tabular font-mono text-right">{fmtBtc(opt.bid_price)}</td>
        <td className="tabular font-mono text-right text-[var(--color-text-muted)]">
          {fmtBtc(opt.ask_price)}
        </td>
        <td className="tabular font-mono text-right text-[var(--color-success)]">
          {fmtUsdSmall(m.premiumUsd)}
        </td>
        <td className="tabular font-mono text-right">{fmtUsd(m.breakeven)}</td>
        <td
          className="tabular font-mono text-right"
          style={{ color: m.pop >= 75 ? "var(--color-success)" : m.pop >= 60 ? "var(--color-warning)" : "var(--color-danger)" }}
        >
          {m.pop.toFixed(0)}%
        </td>
        <td className="tabular font-mono text-right">
          {m.marginBtc !== null ? (
            <div>
              <div className="text-[var(--color-text)]">{m.marginBtc.toFixed(4)}</div>
              {m.marginUsd !== null && (
                <div className="text-[10px] text-[var(--color-text-subtle)]">{fmtUsdSmall(m.marginUsd)}</div>
              )}
            </div>
          ) : (
            <span className="text-[var(--color-text-subtle)]">—</span>
          )}
        </td>
        <td className="tabular font-mono text-right">
          <span
            className="inline-flex items-center gap-1"
            style={{ color: m.roiIsReal ? "var(--color-accent)" : "var(--color-text-muted)" }}
            title={m.roiIsReal ? "ROI real (via get_margins)" : "ROI aproximado (strike como collateral)"}
          >
            {m.roiAnnual.toFixed(1)}%
            {m.roiIsReal && <span className="text-[8px]">●</span>}
          </span>
        </td>
        <td className="tabular font-mono text-right text-[var(--color-text-muted)]">
          {opt.open_interest.toLocaleString()}
        </td>
        <td>
          <span className={`chip ${tone.chip} font-mono tabular`}>{opt.score}</span>
        </td>
        <td>
          <SellButton opt={opt} onSell={onSell} />
        </td>
      </tr>

      {expanded && <DetailRow opt={opt} btcPrice={btcPrice} m={m} />}
    </>
  );
}

// ── Expanded detail row ───────────────────────────────────────────────────────

function DetailRow({
  opt,
  btcPrice,
  m,
}: {
  opt: ScreenedOption;
  btcPrice: number;
  m: ReturnType<typeof deriveMetrics>;
}) {
  const isPut = opt.option_type === "put";
  const distToStrike = Math.abs(opt.strike - btcPrice);
  const distPct = (distToStrike / btcPrice) * 100;

  return (
    <tr>
      <td colSpan={20} className="!p-0 !bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">
          <DetailBlock title="Operação" chip={{ label: isPut ? "VENDER PUT" : "VENDER CALL", tone: isPut ? "success" : "danger" }}>
            <DetailRowKV k="Estratégia" v={isPut ? "Vendedor de PUT OTM" : "Vendedor de CALL OTM"} />
            <DetailRowKV k="Prêmio recebido" v={`${fmtBtc(m.premiumBtc)} BTC`} highlight="success" />
            <DetailRowKV k="Prêmio em USD" v={fmtUsdSmall(m.premiumUsd)} highlight="success" />
            <DetailRowKV k="Spread bid/ask" v={`${fmtBtc(m.spreadBtc)} BTC (${m.spreadPct.toFixed(1)}%)`} />
          </DetailBlock>

          <DetailBlock title="P&L">
            <DetailRowKV k="Max profit" v={fmtUsdSmall(m.maxProfitUsd)} highlight="success" />
            <DetailRowKV
              k="Max loss"
              v={m.maxLossUsd === Infinity ? "Ilimitado" : fmtUsdSmall(m.maxLossUsd)}
              highlight="danger"
            />
            <DetailRowKV k="Breakeven" v={fmtUsd(m.breakeven)} />
            <DetailRowKV k="Target 50% profit" v={`${fmtBtc(opt.mark_price * 0.5)} BTC`} />
          </DetailBlock>

          <DetailBlock
            title="Retorno & margem"
            chip={m.roiIsReal ? { label: "ROI REAL", tone: "accent" } : undefined}
          >
            <DetailRowKV k="POP (via |Δ|)" v={`${m.pop.toFixed(1)}%`} highlight={m.pop >= 75 ? "success" : m.pop >= 60 ? "warning" : "danger"} />
            <DetailRowKV k="Prob. ITM" v={`${(Math.abs(opt.delta) * 100).toFixed(1)}%`} />
            <DetailRowKV
              k={m.roiIsReal ? "ROI anual (margem real)" : "ROI anual (aprox.)"}
              v={`${m.roiAnnual.toFixed(1)}%`}
              highlight="accent"
            />
            {m.roiIsReal && (
              <DetailRowKV k="ROI naïve (strike)" v={`${m.roiNaive.toFixed(1)}%`} />
            )}
            {m.marginBtc !== null && (
              <DetailRowKV
                k="Margem inicial"
                v={`${m.marginBtc.toFixed(6)} BTC${m.marginUsd !== null ? ` · ${fmtUsdSmall(m.marginUsd)}` : ""}`}
              />
            )}
            <DetailRowKV k="Dist. ao strike" v={`${fmtUsd(distToStrike)} (${distPct.toFixed(1)}%)`} />
          </DetailBlock>

          <DetailBlock title="Greeks & Mercado">
            <DetailRowKV k="Delta" v={opt.delta.toFixed(4)} />
            <DetailRowKV k="Gamma" v={opt.gamma.toFixed(6)} />
            <DetailRowKV k="Theta/dia" v={`${opt.theta.toFixed(4)} BTC`} highlight="danger" />
            <DetailRowKV k="Vega" v={opt.vega.toFixed(4)} />
            <DetailRowKV k="IV Mark" v={`${opt.mark_iv}%`} />
            <DetailRowKV k="Open interest" v={opt.open_interest.toLocaleString()} />
          </DetailBlock>
        </div>
      </td>
    </tr>
  );
}

function DetailBlock({
  title,
  chip,
  children,
}: {
  title: string;
  chip?: { label: string; tone: "success" | "danger" | "warning" | "accent" };
  children: React.ReactNode;
}) {
  return (
    <div className="card-muted p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="eyebrow">{title}</p>
        {chip && <span className={`chip chip-${chip.tone}`}>{chip.label}</span>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DetailRowKV({
  k,
  v,
  highlight,
}: {
  k: string;
  v: string;
  highlight?: "success" | "danger" | "warning" | "accent";
}) {
  const color = highlight
    ? {
        success: "var(--color-success)",
        danger: "var(--color-danger)",
        warning: "var(--color-warning)",
        accent: "var(--color-accent)",
      }[highlight]
    : "var(--color-text)";

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--color-text-subtle)]">{k}</span>
      <span className="font-mono tabular font-medium" style={{ color }}>{v}</span>
    </div>
  );
}

// ── Sell button ───────────────────────────────────────────────────────────────

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
    <button onClick={handleSell} disabled={loading} className="btn btn-primary !py-1 !px-3">
      {loading ? "..." : "Vender"}
    </button>
  );
}
