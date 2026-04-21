import { NextResponse } from "next/server";

const TV_API = "https://scanner.tradingview.com/crypto/scan";
const SYMBOL = "BINANCE:BTCUSDT";

// Fields focused on options trading context:
// - Volatility.D/W/M: historical volatility (daily, weekly, monthly %) — proxy for HV
// - ATR: absolute range; ATR|1W for weekly context
// - ADX: trend strength — low ADX = ranging market (ideal for premium selling)
// - ADX+DI / ADX-DI: directional components for bias confirmation
// - RSI + Stoch for overbought/oversold context
// - Recommend.All on 1h/4h for directional summary
const COLUMNS = [
  "close",
  "change",
  // Volatility
  "Volatility.D",
  "Volatility.W",
  "Volatility.M",
  "ATR",
  "ATR|1W",
  // Trend regime
  "ADX",
  "ADX|60",
  "ADX|240",
  "ADX+DI",
  "ADX-DI",
  // Momentum / direction
  "RSI",
  "RSI|60",
  "RSI|240",
  "Stoch.K",
  "Stoch.K|60",
  // Directional summary
  "Recommend.All",
  "Recommend.All|60",
  "Recommend.All|240",
  // OHLC for context
  "high",
  "low",
  "open",
];

export type MarketRegime = "TRENDING" | "RANGING" | "BREAKOUT";
export type DirectionalBias = "BULLISH" | "BEARISH" | "NEUTRAL";

export interface TvOptionsContext {
  symbol: string;
  price: number;
  change_pct: number;
  high: number;
  low: number;
  // Historical volatility proxies (% of close)
  hv_daily: number | null;
  hv_weekly: number | null;
  hv_monthly: number | null;
  // Absolute range
  atr_daily: number | null;
  atr_weekly: number | null;
  // Trend regime
  adx_15m: number | null;
  adx_1h: number | null;
  adx_4h: number | null;
  adx_plus_di: number | null;
  adx_minus_di: number | null;
  regime_1h: MarketRegime;
  // Momentum
  rsi_15m: number | null;
  rsi_1h: number | null;
  rsi_4h: number | null;
  stoch_15m: number | null;
  stoch_1h: number | null;
  // Directional bias
  bias_15m: DirectionalBias;
  bias_1h: DirectionalBias;
  bias_4h: DirectionalBias;
  // Lee Lowell context
  premium_selling_regime: boolean; // true when ADX 1h < 25 (ranging) and HV is elevated
  fetched_at: string;
}

function toRegime(adx: number | null): MarketRegime {
  if (adx === null) return "RANGING";
  if (adx >= 35) return "BREAKOUT";
  if (adx >= 25) return "TRENDING";
  return "RANGING";
}

function toBias(rec: number | null): DirectionalBias {
  if (rec === null) return "NEUTRAL";
  if (rec >= 0.1) return "BULLISH";
  if (rec <= -0.1) return "BEARISH";
  return "NEUTRAL";
}

export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(TV_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbols: { tickers: [SYMBOL] },
        columns: COLUMNS,
      }),
      next: { revalidate: 60 },
    });

    if (!res.ok) throw new Error(`TradingView API: ${res.status}`);

    const json = await res.json() as { data: Array<{ s: string; d: (number | null)[] }> };
    const row = json.data?.[0];
    if (!row) throw new Error("Sem dados para BTCUSDT");

    const d = row.d;
    const [
      close, change,
      hvD, hvW, hvM,
      atrD, atrW,
      adx15m, adx1h, adx4h, adxPlusDI, adxMinusDI,
      rsi15m, rsi1h, rsi4h,
      stoch15m, stoch1h,
      rec15m, rec1h, rec4h,
      high, low,
    ] = d;

    const regime1h = toRegime(adx1h ?? null);
    // Premium selling is better in ranging markets with elevated volatility
    const premiumSellingRegime = regime1h === "RANGING" && (hvM ?? 0) > 2.5;

    const context: TvOptionsContext = {
      symbol: SYMBOL,
      price: close ?? 0,
      change_pct: change ?? 0,
      high: high ?? 0,
      low: low ?? 0,
      hv_daily: hvD ?? null,
      hv_weekly: hvW ?? null,
      hv_monthly: hvM ?? null,
      atr_daily: atrD ?? null,
      atr_weekly: atrW ?? null,
      adx_15m: adx15m ?? null,
      adx_1h: adx1h ?? null,
      adx_4h: adx4h ?? null,
      adx_plus_di: adxPlusDI ?? null,
      adx_minus_di: adxMinusDI ?? null,
      regime_1h: regime1h,
      rsi_15m: rsi15m ?? null,
      rsi_1h: rsi1h ?? null,
      rsi_4h: rsi4h ?? null,
      stoch_15m: stoch15m ?? null,
      stoch_1h: stoch1h ?? null,
      bias_15m: toBias(rec15m ?? null),
      bias_1h: toBias(rec1h ?? null),
      bias_4h: toBias(rec4h ?? null),
      premium_selling_regime: premiumSellingRegime,
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
