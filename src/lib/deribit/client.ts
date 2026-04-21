import type {
  DeribitAuthResponse,
  DeribitInstrument,
  DeribitTicker,
  DeribitPosition,
  DeribitOrder,
  PlaceOrderParams,
} from "./types";

const BASE_URL = "https://www.deribit.com/api/v2";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.token;
  }

  const clientId = process.env.DERIBIT_CLIENT_ID;
  const clientSecret = process.env.DERIBIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("DERIBIT_CLIENT_ID e DERIBIT_CLIENT_SECRET não configurados");
  }

  const res = await fetch(
    `${BASE_URL}/public/auth?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "GET" }
  );

  if (!res.ok) {
    throw new Error(`Deribit auth falhou: ${res.status}`);
  }

  const body = await res.json();
  const data: DeribitAuthResponse = body.result;

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

async function publicGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}/public/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Deribit ${path} erro: ${res.status}`);

  const body = await res.json();
  if (body.error) throw new Error(`Deribit erro: ${body.error.message}`);
  return body.result as T;
}

async function privateGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(`${BASE_URL}/private/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Deribit ${path} erro: ${res.status}`);

  const body = await res.json();
  if (body.error) throw new Error(`Deribit erro: ${body.error.message}`);
  return body.result as T;
}

async function privatePost<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/private/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Deribit ${path} erro: ${res.status}`);

  const body = await res.json();
  if (body.error) throw new Error(`Deribit erro: ${body.error.message}`);
  return body.result as T;
}

// ─── Public endpoints ─────────────────────────────────────────────────────────

export interface DvolEntry {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface DvolResult {
  current: number;
  min_52w: number;
  max_52w: number;
  iv_rank: number; // 0–100: percentile of current vs 52-week range
  iv_percentile: number; // % of days below current
  entries: DvolEntry[];
}

export interface BtcDailyBias {
  close: number;
  sma5: number;
  sma20: number;
  sma50: number;
  rsi14: number;
  bias_4h: "BULLISH" | "BEARISH" | "NEUTRAL"; // placeholder, filled by TV
  bias_daily: "BULLISH" | "BEARISH";   // close vs SMA20
  bias_weekly: "BULLISH" | "BEARISH";  // close vs SMA50
  atr14_pct: number; // 14-day ATR as % of close
}

export async function getBtcDailyBias(): Promise<BtcDailyBias> {
  const endTs = Date.now();
  const startTs = endTs - 365 * 24 * 60 * 60 * 1000;

  const result = await publicGet<{
    ticks: number[];
    open: number[];
    high: number[];
    low: number[];
    close: number[];
  }>("get_tradingview_chart_data", {
    instrument_name: "BTC-PERPETUAL",
    start_timestamp: startTs,
    end_timestamp: endTs,
    resolution: "1D",
  });

  const closes = result.close;
  const highs = result.high;
  const lows = result.low;
  const n = closes.length;

  if (n < 20) throw new Error("Dados insuficientes para calcular viés diário");

  const close = closes[n - 1];
  const sma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const sma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const sma50 = n >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : sma20;

  // RSI 14
  const period = 14;
  const gains = closes.slice(-period).map((c, i, arr) => i === 0 ? 0 : Math.max(c - arr[i - 1], 0));
  const losses = closes.slice(-period).map((c, i, arr) => i === 0 ? 0 : Math.max(arr[i - 1] - c, 0));
  const avgGain = gains.slice(1).reduce((a, b) => a + b, 0) / (period - 1);
  const avgLoss = losses.slice(1).reduce((a, b) => a + b, 0) / (period - 1);
  const rsi14 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // ATR 14
  const trList = highs.slice(-period).map((h, i) => {
    const prevClose = i === 0 ? closes[n - period - 1] ?? close : closes[n - period + i - 1];
    return Math.max(h - lows[n - period + i], Math.abs(h - prevClose), Math.abs(lows[n - period + i] - prevClose));
  });
  const atr14 = trList.reduce((a, b) => a + b, 0) / period;
  const atr14_pct = (atr14 / close) * 100;

  return {
    close,
    sma5,
    sma20,
    sma50,
    rsi14,
    bias_4h: "NEUTRAL",
    bias_daily: close > sma20 ? "BULLISH" : "BEARISH",
    bias_weekly: close > sma50 ? "BULLISH" : "BEARISH",
    atr14_pct,
  };
}

export async function getDvolAndIvRank(): Promise<DvolResult> {
  const endTs = Date.now();
  const startTs = endTs - 365 * 24 * 60 * 60 * 1000;

  const result = await publicGet<{ data: [number, number, number, number, number][] }>(
    "get_volatility_index_data",
    { currency: "BTC", start_timestamp: startTs, end_timestamp: endTs, resolution: "1D" }
  );

  const entries: DvolEntry[] = result.data.map(([timestamp, open, high, low, close]) => ({
    timestamp, open, high, low, close,
  }));

  const closes = entries.map((e) => e.close);
  const current = closes[closes.length - 1];
  const min_52w = Math.min(...closes);
  const max_52w = Math.max(...closes);

  // IV Rank: (current - min) / (max - min) * 100
  const iv_rank = max_52w === min_52w ? 0 : ((current - min_52w) / (max_52w - min_52w)) * 100;

  // IV Percentile: % of days below current
  const below = closes.filter((c) => c < current).length;
  const iv_percentile = (below / closes.length) * 100;

  return { current, min_52w, max_52w, iv_rank, iv_percentile, entries };
}

export async function getBtcOptions(): Promise<DeribitInstrument[]> {
  return publicGet<DeribitInstrument[]>("get_instruments", {
    currency: "BTC",
    kind: "option",
    expired: "false",
  });
}

export async function getTicker(instrumentName: string): Promise<DeribitTicker> {
  return publicGet<DeribitTicker>("ticker", { instrument_name: instrumentName });
}

export async function getBtcIndexPrice(): Promise<number> {
  const result = await publicGet<{ index_price: number }>("get_index_price", {
    index_name: "btc_usd",
  });
  return result.index_price;
}

// ─── Private endpoints ────────────────────────────────────────────────────────

export async function getOpenPositions(): Promise<DeribitPosition[]> {
  return privateGet<DeribitPosition[]>("get_positions", {
    currency: "BTC",
    kind: "option",
  });
}

export async function getOpenOrders(): Promise<DeribitOrder[]> {
  return privateGet<DeribitOrder[]>("get_open_orders_by_currency", {
    currency: "BTC",
    kind: "option",
  });
}

export async function sellOption(params: PlaceOrderParams): Promise<{ order: DeribitOrder }> {
  const paperTrading = process.env.PAPER_TRADING !== "false";
  if (paperTrading) {
    return {
      order: {
        order_id: `PAPER-${Date.now()}`,
        instrument_name: params.instrument_name,
        direction: "sell",
        order_type: params.type,
        order_state: "filled",
        amount: params.amount,
        price: params.price ?? "market",
        filled_amount: params.amount,
        average_price: params.price ?? 0,
        creation_timestamp: Date.now(),
        last_update_timestamp: Date.now(),
        reduce_only: false,
        post_only: params.post_only ?? false,
        label: params.label ?? "paper",
      },
    };
  }

  return privatePost<{ order: DeribitOrder }>("sell", {
    instrument_name: params.instrument_name,
    amount: params.amount,
    type: params.type,
    ...(params.price !== undefined && { price: params.price }),
    ...(params.label && { label: params.label }),
    ...(params.post_only && { post_only: params.post_only }),
  });
}

export async function closePosition(
  instrumentName: string,
  amount: number,
  type: "limit" | "market" = "market",
  price?: number
): Promise<{ order: DeribitOrder }> {
  const paperTrading = process.env.PAPER_TRADING !== "false";
  if (paperTrading) {
    return {
      order: {
        order_id: `PAPER-CLOSE-${Date.now()}`,
        instrument_name: instrumentName,
        direction: "buy",
        order_type: type,
        order_state: "filled",
        amount,
        price: price ?? "market",
        filled_amount: amount,
        average_price: price ?? 0,
        creation_timestamp: Date.now(),
        last_update_timestamp: Date.now(),
        reduce_only: true,
        post_only: false,
        label: "close",
      },
    };
  }

  return privatePost<{ order: DeribitOrder }>("buy", {
    instrument_name: instrumentName,
    amount,
    type,
    ...(price !== undefined && { price }),
    reduce_only: true,
    label: "close",
  });
}
