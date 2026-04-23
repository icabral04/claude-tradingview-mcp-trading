import { getBookSummaryByCurrency, getBtcIndexPrice, getBtcOptions } from "@/lib/deribit/client";
import type { DeribitBookSummary, DeribitInstrument } from "@/lib/deribit/types";

export interface OiCell {
  call_oi: number;
  put_oi: number;
}

export interface OiExpiry {
  expiration_timestamp: number;
  dte: number;
  label: string;
  total_oi: number;
  pcr_oi: number;
  max_pain: number | null;
  atm_iv: number | null;
}

export interface OiPanelResult {
  btc_price: number;
  fetched_at: string;
  strikes: number[];
  expiries: OiExpiry[];
  /** cells[expiryIdx][strikeIdx] */
  cells: OiCell[][];
  max_oi: number;
  top_put_wall: { strike: number; put_oi: number } | null;
  top_call_wall: { strike: number; call_oi: number } | null;
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

function computeMaxPain(books: EnrichedBook[]): number | null {
  const strikes = Array.from(new Set(books.map((b) => b.instrument.strike))).sort((a, b) => a - b);
  if (strikes.length === 0) return null;

  let minPain = Infinity;
  let maxPainStrike: number | null = null;

  for (const candidate of strikes) {
    let pain = 0;
    for (const { summary, instrument } of books) {
      const oi = summary.open_interest;
      if (oi <= 0) continue;
      if (instrument.option_type === "call") {
        pain += Math.max(candidate - instrument.strike, 0) * oi;
      } else {
        pain += Math.max(instrument.strike - candidate, 0) * oi;
      }
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = candidate;
    }
  }
  return maxPainStrike;
}

function computeAtmIv(books: EnrichedBook[], btcPrice: number): number | null {
  const calls = books.filter((b) => b.instrument.option_type === "call" && b.summary.mark_iv);
  if (calls.length === 0) return null;
  const sorted = calls.sort(
    (a, b) => Math.abs(a.instrument.strike - btcPrice) - Math.abs(b.instrument.strike - btcPrice)
  );
  return sorted[0].summary.mark_iv ?? null;
}

export interface OiPanelOptions {
  max_expiries?: number;
  strike_window_pct?: number;
}

export async function computeOiPanel(opts: OiPanelOptions = {}): Promise<OiPanelResult> {
  const maxExpiries = opts.max_expiries ?? 8;
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
  const expiryEntries = Array.from(byExpiry.entries())
    .filter(([ts]) => ts > now)
    .sort(([a], [b]) => a - b)
    .slice(0, maxExpiries);

  const lo = btcPrice * (1 - strikeWindowPct);
  const hi = btcPrice * (1 + strikeWindowPct);

  const strikeSet = new Set<number>();
  for (const [, books] of expiryEntries) {
    for (const b of books) {
      if (b.instrument.strike >= lo && b.instrument.strike <= hi) {
        strikeSet.add(b.instrument.strike);
      }
    }
  }
  const strikes = Array.from(strikeSet).sort((a, b) => a - b);

  const expiries: OiExpiry[] = [];
  const cells: OiCell[][] = [];
  let globalMaxOi = 0;
  let topPutWall: { strike: number; put_oi: number } | null = null;
  let topCallWall: { strike: number; call_oi: number } | null = null;

  for (const [ts, books] of expiryEntries) {
    const row: OiCell[] = strikes.map(() => ({ call_oi: 0, put_oi: 0 }));
    let callOi = 0;
    let putOi = 0;

    for (const b of books) {
      const idx = strikes.indexOf(b.instrument.strike);
      if (idx < 0) continue;
      const oi = b.summary.open_interest;
      if (b.instrument.option_type === "call") {
        row[idx].call_oi += oi;
        callOi += oi;
      } else {
        row[idx].put_oi += oi;
        putOi += oi;
      }
    }

    for (let i = 0; i < row.length; i++) {
      const total = row[i].call_oi + row[i].put_oi;
      if (total > globalMaxOi) globalMaxOi = total;
      if (!topPutWall || row[i].put_oi > topPutWall.put_oi) {
        topPutWall = { strike: strikes[i], put_oi: row[i].put_oi };
      }
      if (!topCallWall || row[i].call_oi > topCallWall.call_oi) {
        topCallWall = { strike: strikes[i], call_oi: row[i].call_oi };
      }
    }

    cells.push(row);
    expiries.push({
      expiration_timestamp: ts,
      dte: Math.round(((ts - now) / (1000 * 60 * 60 * 24)) * 10) / 10,
      label: formatExpiryLabel(ts),
      total_oi: Math.round((callOi + putOi) * 10) / 10,
      pcr_oi: callOi > 0 ? Math.round((putOi / callOi) * 100) / 100 : 0,
      max_pain: computeMaxPain(books),
      atm_iv: (() => {
        const iv = computeAtmIv(books, btcPrice);
        return iv !== null ? Math.round(iv * 10) / 10 : null;
      })(),
    });
  }

  return {
    btc_price: btcPrice,
    fetched_at: new Date().toISOString(),
    strikes,
    expiries,
    cells,
    max_oi: globalMaxOi,
    top_put_wall: topPutWall && topPutWall.put_oi > 0 ? topPutWall : null,
    top_call_wall: topCallWall && topCallWall.call_oi > 0 ? topCallWall : null,
  };
}
