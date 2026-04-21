import { NextRequest, NextResponse } from "next/server";
import { saveSignal } from "@/lib/signal-store";
import type { SignalBias } from "@/lib/deribit/types";

// TradingView alert JSON format esperado:
// {
//   "secret": "{{strategy.order.alert_message}}" ou campo fixo
//   "bias": "bullish" | "bearish" | "neutral",
//   "ticker": "{{ticker}}",
//   "timeframe": "{{interval}}",
//   "price": {{close}},
//   "indicators": { "rsi": {{plot_0}}, "ema": {{plot_1}} }
// }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.WEBHOOK_SECRET;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (webhookSecret && body.secret !== webhookSecret) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const bias = body.bias as SignalBias;
  if (!["bullish", "bearish", "neutral"].includes(bias)) {
    return NextResponse.json(
      { error: "bias deve ser bullish, bearish ou neutral" },
      { status: 400 }
    );
  }

  saveSignal({
    bias,
    source: "tradingview",
    ticker: String(body.ticker ?? "BTCUSDT"),
    timeframe: String(body.timeframe ?? ""),
    price: Number(body.price ?? 0),
    indicators: (body.indicators as Record<string, number | string>) ?? {},
    received_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, bias });
}
