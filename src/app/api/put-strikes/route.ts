import { NextResponse } from "next/server";
import { loadBook, filterByType } from "@/lib/strategies/book";

interface PutRow {
  instrument_name: string;
  strike: number;
  distance_pct: number;
  delta: number;
  mark_iv: number;
  mark_price_btc: number;
  mark_price_usd: number;
  bid_price: number;
  ask_price: number;
  premium_usd: number;
  open_interest: number;
  price_source: "bid" | "mark";
}

interface ExpiryGroup {
  expiration_timestamp: number;
  dte: number;
  label: string;
  puts: PutRow[];
}

interface PutStrikesResult {
  spot: number;
  fetched_at: string;
  expiries: ExpiryGroup[];
}

function formatLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const dteMin = Number(url.searchParams.get("dte_min") ?? "5");
    const dteMax = Number(url.searchParams.get("dte_max") ?? "45");
    const lowerPct = Number(url.searchParams.get("lower_pct") ?? "0.7");
    const upperPct = Number(url.searchParams.get("upper_pct") ?? "1.02");

    const { spot, quotes } = await loadBook(dteMin, dteMax);
    const puts = filterByType(quotes, "put");

    const lo = spot * lowerPct;
    const hi = spot * upperPct;

    const filtered = puts.filter(
      (q) => q.instrument.strike >= lo && q.instrument.strike <= hi
    );

    const byExpiry = new Map<number, PutRow[]>();
    for (const q of filtered) {
      const ts = q.instrument.expiration_timestamp;
      const t = q.ticker;
      const markBtc = t.mark_price ?? 0;
      const premiumUsd = markBtc * spot;
      const row: PutRow = {
        instrument_name: q.instrument.instrument_name,
        strike: q.instrument.strike,
        distance_pct: Math.round(((q.instrument.strike / spot - 1) * 100) * 10) / 10,
        delta: t.greeks?.delta ?? 0,
        mark_iv: Math.round((t.mark_iv ?? 0) * 10) / 10,
        mark_price_btc: Math.round(markBtc * 1e6) / 1e6,
        mark_price_usd: Math.round(premiumUsd),
        bid_price: t.bid_price ?? 0,
        ask_price: t.ask_price ?? 0,
        premium_usd: Math.round(premiumUsd),
        open_interest: t.open_interest ?? 0,
        price_source: q.price_source,
      };
      const arr = byExpiry.get(ts) ?? [];
      arr.push(row);
      byExpiry.set(ts, arr);
    }

    const expiries: ExpiryGroup[] = Array.from(byExpiry.entries())
      .sort(([a], [b]) => a - b)
      .map(([ts, puts]) => ({
        expiration_timestamp: ts,
        dte: Math.round(((ts - Date.now()) / (1000 * 60 * 60 * 24)) * 10) / 10,
        label: formatLabel(ts),
        puts: puts.sort((a, b) => b.strike - a.strike),
      }));

    const result: PutStrikesResult = {
      spot,
      fetched_at: new Date().toISOString(),
      expiries,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
