import { NextResponse } from "next/server";
import { runSellPutBacktest } from "@/lib/backtest/sell-put";

let cache: { at: number; data: Awaited<ReturnType<typeof runSellPutBacktest>> } | null = null;
const TTL_MS = 10 * 60 * 1000; // 10 min: backtest histórico muda pouco

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const n = Number(new URL(req.url).searchParams.get("n") ?? "12");
    if (cache && Date.now() - cache.at < TTL_MS && cache.data.trades.length === n) {
      return NextResponse.json(cache.data);
    }
    const data = await runSellPutBacktest(n);
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
