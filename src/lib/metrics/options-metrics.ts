import { getBookSummaryByCurrency, getBtcIndexPrice, getBtcOptions } from "@/lib/deribit/client";
import type { DeribitBookSummary, DeribitInstrument } from "@/lib/deribit/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpiryMetrics {
  expiration_timestamp: number;
  dte: number;
  label: string;
  call_oi: number;
  put_oi: number;
  call_volume: number;
  put_volume: number;
  pcr_oi: number;
  pcr_volume: number;
  max_pain: number | null;
  atm_iv: number | null;
  atm_strike: number | null;
  strikes_count: number;
}

export interface StrikeOi {
  strike: number;
  call_oi: number;
  put_oi: number;
  total_oi: number;
}

export interface OptionsMetricsResult {
  btc_price: number;
  fetched_at: string;
  total_instruments: number;
  total_call_oi: number;
  total_put_oi: number;
  total_call_volume_24h: number;
  total_put_volume_24h: number;
  total_oi_usd: number;
  total_volume_usd_24h: number;
  pcr_oi: number;
  pcr_volume: number;
  expiries: ExpiryMetrics[];
  top_strikes_by_oi: StrikeOi[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface EnrichedBook {
  summary: DeribitBookSummary;
  instrument: DeribitInstrument;
}

function parseExpiryFromInstrument(name: string): number | null {
  // BTC-26DEC25-100000-C
  const parts = name.split("-");
  if (parts.length < 4) return null;
  const dateStr = parts[1];
  const d = parseDeribitDate(dateStr);
  return d ? d.getTime() : null;
}

function parseDeribitDate(str: string): Date | null {
  // Format: 26DEC25, 1JAN26
  const m = str.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const [, day, mon, yy] = m;
  const monIdx = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(mon);
  if (monIdx < 0) return null;
  const year = 2000 + parseInt(yy, 10);
  // Deribit options expire at 08:00 UTC
  return new Date(Date.UTC(year, monIdx, parseInt(day, 10), 8, 0, 0));
}

function formatExpiryLabel(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
}

// Max pain: strike que minimiza o payoff total de COMPRADORES
// Para cada strike candidato K, soma:
//   Calls payoff pagos = Σ max(S - K_call, 0) * OI_call   (S = K candidato)
//   Puts payoff pagos  = Σ max(K_put - S, 0) * OI_put
// O strike que MINIMIZA o total é o max pain.
function computeMaxPain(expiryBooks: EnrichedBook[]): number | null {
  const strikes = Array.from(new Set(expiryBooks.map((b) => b.instrument.strike))).sort((a, b) => a - b);
  if (strikes.length === 0) return null;

  let minPain = Infinity;
  let maxPainStrike: number | null = null;

  for (const candidate of strikes) {
    let pain = 0;
    for (const { summary, instrument } of expiryBooks) {
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

function computeAtmIv(expiryBooks: EnrichedBook[], btcPrice: number): { iv: number | null; strike: number | null } {
  // ATM = call mais próximo do preço atual
  const calls = expiryBooks.filter((b) => b.instrument.option_type === "call" && b.summary.mark_iv);
  if (calls.length === 0) return { iv: null, strike: null };

  const sorted = calls.sort(
    (a, b) => Math.abs(a.instrument.strike - btcPrice) - Math.abs(b.instrument.strike - btcPrice)
  );
  const atm = sorted[0];
  return { iv: atm.summary.mark_iv ?? null, strike: atm.instrument.strike };
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function computeOptionsMetrics(): Promise<OptionsMetricsResult> {
  const [summaries, instruments, btcPrice] = await Promise.all([
    getBookSummaryByCurrency(),
    getBtcOptions(),
    getBtcIndexPrice(),
  ]);

  // Map instruments by name for O(1) lookup
  const instrumentMap = new Map<string, DeribitInstrument>();
  for (const inst of instruments) instrumentMap.set(inst.instrument_name, inst);

  // Join summaries with instruments
  const enriched: EnrichedBook[] = [];
  for (const s of summaries) {
    const inst = instrumentMap.get(s.instrument_name);
    if (!inst || !inst.is_active) continue;
    enriched.push({ summary: s, instrument: inst });
  }

  // Group by expiration
  const byExpiry = new Map<number, EnrichedBook[]>();
  for (const e of enriched) {
    const ts = e.instrument.expiration_timestamp ?? parseExpiryFromInstrument(e.instrument.instrument_name);
    if (!ts) continue;
    const arr = byExpiry.get(ts) ?? [];
    arr.push(e);
    byExpiry.set(ts, arr);
  }

  // Per-expiry metrics
  const expiries: ExpiryMetrics[] = [];
  let totalCallOi = 0;
  let totalPutOi = 0;
  let totalCallVol = 0;
  let totalPutVol = 0;
  let totalVolUsd = 0;

  for (const [ts, books] of byExpiry.entries()) {
    const dte = Math.max(0, (ts - Date.now()) / (1000 * 60 * 60 * 24));
    let callOi = 0;
    let putOi = 0;
    let callVol = 0;
    let putVol = 0;
    const strikes = new Set<number>();

    for (const b of books) {
      strikes.add(b.instrument.strike);
      if (b.instrument.option_type === "call") {
        callOi += b.summary.open_interest;
        callVol += b.summary.volume;
      } else {
        putOi += b.summary.open_interest;
        putVol += b.summary.volume;
      }
      totalVolUsd += b.summary.volume_usd ?? 0;
    }

    totalCallOi += callOi;
    totalPutOi += putOi;
    totalCallVol += callVol;
    totalPutVol += putVol;

    const { iv, strike: atmStrike } = computeAtmIv(books, btcPrice);
    const maxPain = computeMaxPain(books);

    expiries.push({
      expiration_timestamp: ts,
      dte: Math.round(dte * 10) / 10,
      label: formatExpiryLabel(ts),
      call_oi: Math.round(callOi * 10) / 10,
      put_oi: Math.round(putOi * 10) / 10,
      call_volume: Math.round(callVol * 10) / 10,
      put_volume: Math.round(putVol * 10) / 10,
      pcr_oi: callOi > 0 ? Math.round((putOi / callOi) * 100) / 100 : 0,
      pcr_volume: callVol > 0 ? Math.round((putVol / callVol) * 100) / 100 : 0,
      max_pain: maxPain,
      atm_iv: iv !== null ? Math.round(iv * 10) / 10 : null,
      atm_strike: atmStrike,
      strikes_count: strikes.size,
    });
  }

  expiries.sort((a, b) => a.expiration_timestamp - b.expiration_timestamp);

  // OI per strike (aggregated across all expiries)
  const strikeMap = new Map<number, StrikeOi>();
  for (const e of enriched) {
    const k = e.instrument.strike;
    const existing = strikeMap.get(k) ?? { strike: k, call_oi: 0, put_oi: 0, total_oi: 0 };
    if (e.instrument.option_type === "call") existing.call_oi += e.summary.open_interest;
    else existing.put_oi += e.summary.open_interest;
    existing.total_oi = existing.call_oi + existing.put_oi;
    strikeMap.set(k, existing);
  }
  const topStrikes = Array.from(strikeMap.values())
    .sort((a, b) => b.total_oi - a.total_oi)
    .slice(0, 15)
    .sort((a, b) => a.strike - b.strike);

  // Approximate OI in USD: OI (BTC contracts) × BTC price
  const totalOiUsd = (totalCallOi + totalPutOi) * btcPrice;

  return {
    btc_price: btcPrice,
    fetched_at: new Date().toISOString(),
    total_instruments: enriched.length,
    total_call_oi: Math.round(totalCallOi * 10) / 10,
    total_put_oi: Math.round(totalPutOi * 10) / 10,
    total_call_volume_24h: Math.round(totalCallVol * 10) / 10,
    total_put_volume_24h: Math.round(totalPutVol * 10) / 10,
    total_oi_usd: Math.round(totalOiUsd),
    total_volume_usd_24h: Math.round(totalVolUsd),
    pcr_oi: totalCallOi > 0 ? Math.round((totalPutOi / totalCallOi) * 100) / 100 : 0,
    pcr_volume: totalCallVol > 0 ? Math.round((totalPutVol / totalCallVol) * 100) / 100 : 0,
    expiries,
    top_strikes_by_oi: topStrikes,
  };
}
