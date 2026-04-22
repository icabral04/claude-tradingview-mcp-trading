import { NextResponse } from "next/server";
import { getAccountSummary, getBtcIndexPrice } from "@/lib/deribit/client";

export async function GET(): Promise<NextResponse> {
  try {
    const [summary, btcPrice] = await Promise.all([
      getAccountSummary(),
      getBtcIndexPrice().catch(() => null),
    ]);
    return NextResponse.json({ ...summary, btc_price: btcPrice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
