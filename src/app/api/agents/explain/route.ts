import { NextResponse } from "next/server";
import { runAgents } from "@/lib/agents/run";
import { explainWithLlm, type MarketContext } from "@/lib/agents/llm";
import { getBtcIndexPrice } from "@/lib/deribit/client";
import { getBtcFunding } from "@/lib/macro/funding";
import { getYahooQuotes } from "@/lib/macro/yahoo";
import { getBtcEtfFlows } from "@/lib/macro/farside";
import { computeOiPanel } from "@/lib/metrics/oi-panel";
import { computeVolSurface } from "@/lib/metrics/vol-surface";

async function buildContext(): Promise<MarketContext> {
  const [btcPrice, funding, yahoo, etf, oi, vol] = await Promise.all([
    getBtcIndexPrice().catch(() => null),
    getBtcFunding().catch(() => null),
    getYahooQuotes(["DX-Y.NYB", "^TNX"]).catch(() => null),
    getBtcEtfFlows().catch(() => null),
    computeOiPanel().catch(() => null),
    computeVolSurface().catch(() => null),
  ]);

  const dxyQuote = yahoo?.find((q) => q.symbol === "DX-Y.NYB") ?? null;
  const tnxQuote = yahoo?.find((q) => q.symbol === "^TNX") ?? null;

  const ivFront = vol?.term_structure?.[0]?.atm_iv ?? null;
  const ivBack = vol?.term_structure?.[vol.term_structure.length - 1]?.atm_iv ?? null;
  const contango = ivFront !== null && ivBack !== null ? ivBack - ivFront : null;
  const skewFront = vol?.expiries?.[0]?.skew_25d ?? null;
  const maxPainFront = oi?.expiries?.[0]?.max_pain ?? null;

  return {
    btc_price: btcPrice,
    funding_rate_8h_pct: funding?.rate_8h_pct ?? null,
    dxy: dxyQuote ? { price: dxyQuote.price, change_pct: dxyQuote.change_pct } : null,
    us10y: tnxQuote ? { yield_pct: tnxQuote.price, change_pct: tnxQuote.change_pct } : null,
    etf_last_flow_musd: etf?.last_net_flow_musd ?? null,
    iv_atm_front: ivFront,
    iv_atm_back: ivBack,
    contango_pp: contango,
    skew_25d_front_pp: skewFront,
    put_wall: oi?.top_put_wall ? { strike: oi.top_put_wall.strike, oi: oi.top_put_wall.put_oi } : null,
    call_wall: oi?.top_call_wall ? { strike: oi.top_call_wall.strike, oi: oi.top_call_wall.call_oi } : null,
    max_pain_front: maxPainFront,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json().catch(() => ({}))) as { horizon?: string };
    const horizonId = body.horizon;
    if (horizonId !== "short" && horizonId !== "medium" && horizonId !== "long") {
      return NextResponse.json(
        { error: "horizon inválido (use 'short' | 'medium' | 'long')" },
        { status: 400 }
      );
    }

    const [report, ctx] = await Promise.all([runAgents(), buildContext()]);
    const horizon = report.horizons.find((h) => h.id === horizonId);
    if (!horizon) {
      return NextResponse.json({ error: `Horizon ${horizonId} não encontrado` }, { status: 404 });
    }

    const explanation = await explainWithLlm(horizon, ctx);
    return NextResponse.json({ horizon: horizonId, explanation, context: ctx });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
