import { NextResponse } from "next/server";
import { getBtcDailyBias } from "@/lib/deribit/client";
import type { DirectionalBias } from "@/app/api/tv-analysis/route";

const TV_API = "https://scanner.tradingview.com/crypto/scan";
const SYMBOL = "BINANCE:BTCUSDT";

export interface BtcBiasResult {
  close: number;
  sma5: number;
  sma20: number;
  sma50: number;
  rsi14: number;
  atr14_pct: number;
  bias_4h: DirectionalBias;
  bias_daily: DirectionalBias;
  bias_weekly: DirectionalBias;
  // 4H ADX from TradingView (trend strength context)
  adx_4h: number | null;
  fetched_at: string;
}

function toDirectional(raw: "BULLISH" | "BEARISH"): DirectionalBias {
  return raw;
}

function recToBias(v: number | null): DirectionalBias {
  if (v === null) return "NEUTRAL";
  if (v >= 0.1) return "BULLISH";
  if (v <= -0.1) return "BEARISH";
  return "NEUTRAL";
}

export async function GET(): Promise<NextResponse> {
  try {
    const [deribit, tvRes] = await Promise.all([
      getBtcDailyBias(),
      fetch(TV_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: { tickers: [SYMBOL] },
          columns: ["Recommend.All|240", "ADX|240"],
        }),
        next: { revalidate: 60 },
      }),
    ]);

    const tvJson = await tvRes.json() as { data: Array<{ d: (number | null)[] }> };
    const tvRow = tvJson.data?.[0]?.d ?? [null, null];
    const [rec4h, adx4h] = tvRow;

    const result: BtcBiasResult = {
      close: deribit.close,
      sma5: deribit.sma5,
      sma20: deribit.sma20,
      sma50: deribit.sma50,
      rsi14: deribit.rsi14,
      atr14_pct: deribit.atr14_pct,
      bias_4h: recToBias(rec4h),
      bias_daily: toDirectional(deribit.bias_daily),
      bias_weekly: toDirectional(deribit.bias_weekly),
      adx_4h: adx4h ?? null,
      fetched_at: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
