import { getBookSummaryByCurrency, getBtcIndexPrice, getBtcOptions } from "@/lib/deribit/client";
import type { DeribitBookSummary, DeribitInstrument } from "@/lib/deribit/types";

export interface VolSurfacePoint {
  strike: number;
  moneyness: number;
  iv: number;
}

export interface VolExpiry {
  expiration_timestamp: number;
  dte: number;
  label: string;
  atm_iv: number | null;
  atm_strike: number | null;
  /** skew metric: put IV (25Δ-ish OTM) − call IV (25Δ-ish OTM), em pontos pct */
  skew_25d: number | null;
  /** smile curve: pontos (strike, iv) para calls+puts OTM dessa expiry */
  smile: VolSurfacePoint[];
}

export interface VolSurfaceResult {
  btc_price: number;
  fetched_at: string;
  expiries: VolExpiry[];
  term_structure: Array<{ dte: number; label: string; atm_iv: number | null }>;
}

interface EnrichedBook {
  summary: DeribitBookSummary;
  instrument: DeribitInstrument;
}

function parseDeribitDate(str: string): number | null {
  const m = str.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const [, day, mon, yy] = m;
  const monIdx = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(mon);
  if (monIdx < 0) return null;
  return Date.UTC(2000 + parseInt(yy, 10), monIdx, parseInt(day, 10), 8, 0, 0);
}

function parseExpiryFromInstrument(name: string): number | null {
  const parts = name.split("-");
  if (parts.length < 4) return null;
  return parseDeribitDate(parts[1]);
}

function formatExpiryLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
}

export interface VolSurfaceOptions {
  max_expiries?: number;
  strike_window_pct?: number;
}

export async function computeVolSurface(opts: VolSurfaceOptions = {}): Promise<VolSurfaceResult> {
  const maxExpiries = opts.max_expiries ?? 6;
  const strikeWindowPct = opts.strike_window_pct ?? 0.35;

  const [summaries, instruments, btcPrice] = await Promise.all([
    getBookSummaryByCurrency(),
    getBtcOptions(),
    getBtcIndexPrice(),
  ]);

  const instrumentMap = new Map<string, DeribitInstrument>();
  for (const inst of instruments) instrumentMap.set(inst.instrument_name, inst);

  const enriched: EnrichedBook[] = [];
  for (const s of summaries) {
    const inst = instrumentMap.get(s.instrument_name);
    if (!inst || !inst.is_active) continue;
    if (s.mark_iv == null || s.mark_iv <= 0) continue;
    enriched.push({ summary: s, instrument: inst });
  }

  const byExpiry = new Map<number, EnrichedBook[]>();
  for (const e of enriched) {
    const ts = e.instrument.expiration_timestamp ?? parseExpiryFromInstrument(e.instrument.instrument_name);
    if (!ts) continue;
    const arr = byExpiry.get(ts) ?? [];
    arr.push(e);
    byExpiry.set(ts, arr);
  }

  const now = Date.now();
  const entries = Array.from(byExpiry.entries())
    .filter(([ts]) => ts > now)
    .sort(([a], [b]) => a - b)
    .slice(0, maxExpiries);

  const lo = btcPrice * (1 - strikeWindowPct);
  const hi = btcPrice * (1 + strikeWindowPct);

  const expiries: VolExpiry[] = [];

  for (const [ts, books] of entries) {
    const dte = Math.round(((ts - now) / (1000 * 60 * 60 * 24)) * 10) / 10;

    const calls = books.filter((b) => b.instrument.option_type === "call");
    const puts = books.filter((b) => b.instrument.option_type === "put");

    const sortedCalls = calls.sort(
      (a, b) => Math.abs(a.instrument.strike - btcPrice) - Math.abs(b.instrument.strike - btcPrice)
    );
    const atm = sortedCalls[0];
    const atmIv = atm ? atm.summary.mark_iv ?? null : null;
    const atmStrike = atm ? atm.instrument.strike : null;

    const smile: VolSurfacePoint[] = [];
    const byStrike = new Map<number, { call?: number; put?: number }>();

    for (const b of books) {
      if (b.instrument.strike < lo || b.instrument.strike > hi) continue;
      const iv = b.summary.mark_iv;
      if (!iv) continue;
      const k = b.instrument.strike;
      const existing = byStrike.get(k) ?? {};
      if (b.instrument.option_type === "call") existing.call = iv;
      else existing.put = iv;
      byStrike.set(k, existing);
    }

    const strikes = Array.from(byStrike.keys()).sort((a, b) => a - b);
    for (const k of strikes) {
      const { call, put } = byStrike.get(k)!;
      const iv = k >= btcPrice ? (call ?? put) : (put ?? call);
      if (iv == null) continue;
      smile.push({
        strike: k,
        moneyness: Math.round(((k / btcPrice - 1) * 100) * 10) / 10,
        iv: Math.round(iv * 10) / 10,
      });
    }

    const put25 = puts
      .filter((b) => b.instrument.strike < btcPrice)
      .sort(
        (a, b) =>
          Math.abs((a.instrument.strike / btcPrice) - 0.85) -
          Math.abs((b.instrument.strike / btcPrice) - 0.85)
      )[0];
    const call25 = calls
      .filter((b) => b.instrument.strike > btcPrice)
      .sort(
        (a, b) =>
          Math.abs((a.instrument.strike / btcPrice) - 1.15) -
          Math.abs((b.instrument.strike / btcPrice) - 1.15)
      )[0];

    const skew =
      put25 && call25 && put25.summary.mark_iv && call25.summary.mark_iv
        ? Math.round((put25.summary.mark_iv - call25.summary.mark_iv) * 10) / 10
        : null;

    expiries.push({
      expiration_timestamp: ts,
      dte,
      label: formatExpiryLabel(ts),
      atm_iv: atmIv !== null ? Math.round(atmIv * 10) / 10 : null,
      atm_strike: atmStrike,
      skew_25d: skew,
      smile,
    });
  }

  return {
    btc_price: btcPrice,
    fetched_at: new Date().toISOString(),
    expiries,
    term_structure: expiries.map((e) => ({
      dte: e.dte,
      label: e.label,
      atm_iv: e.atm_iv,
    })),
  };
}
