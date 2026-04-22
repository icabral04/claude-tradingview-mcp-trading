import { NextResponse } from "next/server";
import { computeOptionsMetrics } from "@/lib/metrics/options-metrics";

let cache: { at: number; data: Awaited<ReturnType<typeof computeOptionsMetrics>> } | null = null;
const TTL_MS = 30_000;

export async function GET(): Promise<NextResponse> {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json(cache.data);
    }
    const data = await computeOptionsMetrics();
    cache = { at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
