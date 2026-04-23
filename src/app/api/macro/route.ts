import { NextResponse } from "next/server";
import { getBtcIndexPrice } from "@/lib/deribit/client";
import { getBtcFunding, type FundingSnapshot } from "@/lib/macro/funding";
import { getYahooQuotes, type YahooQuote } from "@/lib/macro/yahoo";
import { getBtcEtfFlows, type EtfFlowSnapshot } from "@/lib/macro/farside";

interface MacroResult {
  btc_price: number | null;
  funding: FundingSnapshot | null;
  yahoo: YahooQuote[] | null;
  etf_flows: EtfFlowSnapshot | null;
  fetched_at: string;
}

let quickCache: { at: number; data: Omit<MacroResult, "etf_flows"> } | null = null;
let etfCache: { at: number; data: EtfFlowSnapshot | null } | null = null;
const QUICK_TTL = 60_000; // spot, funding, Yahoo: 1 min
const ETF_TTL = 60 * 60 * 1000; // Farside: 1h

async function loadQuick(): Promise<Omit<MacroResult, "etf_flows">> {
  if (quickCache && Date.now() - quickCache.at < QUICK_TTL) {
    return quickCache.data;
  }
  const [btcPrice, funding, yahoo] = await Promise.all([
    getBtcIndexPrice().catch(() => null),
    getBtcFunding(),
    getYahooQuotes(["DX-Y.NYB", "^TNX", "ES=F", "GC=F"]),
  ]);
  const data = {
    btc_price: btcPrice,
    funding,
    yahoo,
    fetched_at: new Date().toISOString(),
  };
  quickCache = { at: Date.now(), data };
  return data;
}

async function loadEtf(): Promise<EtfFlowSnapshot | null> {
  if (etfCache && Date.now() - etfCache.at < ETF_TTL) return etfCache.data;
  const data = await getBtcEtfFlows();
  etfCache = { at: Date.now(), data };
  return data;
}

export async function GET(): Promise<NextResponse> {
  try {
    const [quick, etfFlows] = await Promise.all([loadQuick(), loadEtf()]);
    const result: MacroResult = {
      ...quick,
      etf_flows: etfFlows,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
