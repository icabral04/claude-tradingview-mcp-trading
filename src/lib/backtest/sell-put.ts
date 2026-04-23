/**
 * Backtest simples: quanto rendeu vender PUT Δ~30 semanalmente na Deribit
 * nos últimos N expiries.
 *
 * Aproximações:
 * - Entrada: 7 dias antes do expiry (weekly), strike = S × (1 − 0.525 × σ × √T)
 *   (inversão Black-Scholes para Δ=0.30 put).
 * - σ (IV) vem do DVOL no momento da entrada.
 * - Prêmio = BS_put com mesmos parâmetros.
 * - Fim: preço de delivery do expiry. PnL = prêmio − max(K − S_close, 0).
 *
 * Limitações: não há historical option chain granular — o DVOL é ATM 30d,
 * não o IV da put Δ-30. Tratar como estimativa direcional.
 */

const DERIBIT = "https://www.deribit.com/api/v2";

export interface BacktestTrade {
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

export interface BacktestResult {
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
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function cdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function putBS(S: number, K: number, T: number, sigma: number): number {
  if (T <= 0 || sigma <= 0) return Math.max(K - S, 0);
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return K * cdf(-d2) - S * cdf(-d1);
}

interface DeribitSettlement {
  instrument_name: string;
  timestamp: number;
  type: string;
  mark_price?: number;
  index_price?: number;
}

async function fetchJson<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${DERIBIT}/public/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Deribit ${path} ${res.status}`);
  const body = (await res.json()) as { result: T; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function getOptionSettlements(count: number): Promise<DeribitSettlement[]> {
  const body = await fetchJson<{ settlements: DeribitSettlement[] }>("get_last_settlements_by_currency", {
    currency: "BTC",
    type: "delivery",
    count,
  });
  return body.settlements ?? [];
}

async function getBtcSpotAt(ts: number): Promise<number | null> {
  const dayMs = 24 * 60 * 60 * 1000;
  const start = ts - dayMs;
  const end = ts + dayMs;
  try {
    const chart = await fetchJson<{ close: number[]; ticks: number[] }>(
      "get_tradingview_chart_data",
      {
        instrument_name: "BTC-PERPETUAL",
        resolution: "60",
        start_timestamp: start,
        end_timestamp: end,
      }
    );
    if (!chart.close || chart.close.length === 0) return null;
    // Pega o close mais próximo do ts alvo
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < chart.ticks.length; i++) {
      const d = Math.abs(chart.ticks[i] - ts);
      if (d < bestDist) {
        bestDist = d;
        best = chart.close[i];
      }
    }
    return best || null;
  } catch {
    return null;
  }
}

async function getDvolAt(ts: number): Promise<number | null> {
  const dayMs = 24 * 60 * 60 * 1000;
  try {
    const body = await fetchJson<{ data: Array<[number, number, number, number, number]> }>(
      "get_volatility_index_data",
      {
        currency: "BTC",
        start_timestamp: ts - dayMs,
        end_timestamp: ts + dayMs,
        resolution: 3600,
      }
    );
    const data = body.data ?? [];
    if (data.length === 0) return null;
    let best = 0;
    let bestDist = Infinity;
    for (const [t, , , , close] of data) {
      const d = Math.abs(t - ts);
      if (d < bestDist) {
        bestDist = d;
        best = close;
      }
    }
    return best || null;
  } catch {
    return null;
  }
}

function parseExpiryFromInstrument(name: string): number | null {
  const parts = name.split("-");
  if (parts.length < 4) return null;
  const dateStr = parts[1];
  const m = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!m) return null;
  const [, day, mon, yy] = m;
  const monIdx = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(mon);
  if (monIdx < 0) return null;
  return Date.UTC(2000 + parseInt(yy, 10), monIdx, parseInt(day, 10), 8, 0, 0);
}

function isOptionInstrument(name: string): boolean {
  return /^BTC-\d+[A-Z]+\d+-\d+-[CP]$/.test(name);
}

export async function runSellPutBacktest(nExpiries = 12): Promise<BacktestResult> {
  // Busca settlements suficientes para extrair ~N expiries únicos.
  const settlements = await getOptionSettlements(500);
  const optionSettlements = settlements.filter((s) => isOptionInstrument(s.instrument_name));

  const expiryMap = new Map<number, DeribitSettlement>();
  for (const s of optionSettlements) {
    const ts = parseExpiryFromInstrument(s.instrument_name);
    if (!ts) continue;
    if (!expiryMap.has(ts) || s.timestamp > expiryMap.get(ts)!.timestamp) {
      expiryMap.set(ts, s);
    }
  }

  const expiries = Array.from(expiryMap.entries())
    .sort(([a], [b]) => b - a)
    .slice(0, nExpiries);

  const dayMs = 24 * 60 * 60 * 1000;
  const T = 7 / 365;
  const sqrtT = Math.sqrt(T);
  const deltaTarget = 0.30;
  const zDelta = 0.5244; // |Φ⁻¹(0.30)|

  const trades: BacktestTrade[] = [];

  for (const [expiryTs, settlement] of expiries) {
    const entryTs = expiryTs - 7 * dayMs;
    const [sOpen, dvol] = await Promise.all([getBtcSpotAt(entryTs), getDvolAt(entryTs)]);
    const sClose = settlement.mark_price ?? settlement.index_price ?? (await getBtcSpotAt(expiryTs));
    if (!sOpen || !sClose || !dvol) continue;

    const sigma = dvol / 100;
    const strike = sOpen * (1 - zDelta * sigma * sqrtT);
    const premium = putBS(sOpen, strike, T, sigma);
    const intrinsic = Math.max(strike - sClose, 0);
    const pnl = premium - intrinsic;
    const roi = (pnl / strike) * 100;

    trades.push({
      expiry_date: new Date(expiryTs).toISOString().slice(0, 10),
      expiry_ts: expiryTs,
      entry_ts: entryTs,
      s_open: Math.round(sOpen),
      s_close: Math.round(sClose),
      iv_annual: Math.round(dvol * 10) / 10,
      strike: Math.round(strike),
      premium_usd: Math.round(premium * 100) / 100,
      pnl_usd: Math.round(pnl * 100) / 100,
      roi_pct: Math.round(roi * 100) / 100,
      won: pnl >= 0,
      _delta_target: deltaTarget, // keep for future
    } as BacktestTrade & { _delta_target: number });
  }

  trades.sort((a, b) => b.expiry_ts - a.expiry_ts);
  const wins = trades.filter((t) => t.won).length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl_usd, 0);
  const avgPnl = trades.length > 0 ? totalPnl / trades.length : 0;
  const avgRoi = trades.length > 0 ? trades.reduce((s, t) => s + t.roi_pct, 0) / trades.length : 0;
  const cumulativeRoi = trades.reduce((s, t) => s + t.roi_pct, 0);

  return {
    fetched_at: new Date().toISOString(),
    trades,
    summary: {
      count: trades.length,
      win_rate: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0,
      total_pnl_usd: Math.round(totalPnl * 100) / 100,
      avg_pnl_usd: Math.round(avgPnl * 100) / 100,
      avg_roi_pct: Math.round(avgRoi * 100) / 100,
      cumulative_roi_pct: Math.round(cumulativeRoi * 100) / 100,
    },
  };
}
