import { NextResponse } from "next/server";
import { getBtcIndexPrice } from "@/lib/deribit/client";
import { getBtcFunding, type FundingSnapshot } from "@/lib/macro/funding";
import { getYahooQuotes, type YahooQuote } from "@/lib/macro/yahoo";
import { getBtcEtfFlows, type EtfFlowSnapshot } from "@/lib/macro/farside";
import { getCryptoFearGreed, type FearGreedSnapshot } from "@/lib/macro/fear-greed";
import { getFredSeries, type FredObservation } from "@/lib/macro/fred";

interface MacroResult {
  btc_price: number | null;
  btc_price_observed_at: number | null;
  funding: FundingSnapshot | null;
  fred: FredObservation[] | null;
  yahoo: YahooQuote[] | null;
  fear_greed: FearGreedSnapshot | null;
  etf_flows: EtfFlowSnapshot | null;
  fetched_at: string;
}

let quickCache: { at: number; data: Omit<MacroResult, "etf_flows"> } | null = null;
let etfCache: { at: number; data: EtfFlowSnapshot | null } | null = null;
const QUICK_TTL = 60_000; // spot, funding, Yahoo, Fear & Greed: 1 min
const FRED_TTL = 30 * 60 * 1000; // FRED é diário: 30 min é suficiente
let fredCache: { at: number; data: FredObservation[] | null } | null = null;
const ETF_TTL = 60 * 60 * 1000; // Farside: 1h

// FRED = dados oficiais (Fed / St. Louis Fed) → fonte de verdade p/ yields, DXY e VIX.
const FRED_SERIES = [
  { id: "DTWEXBGS", label: "DXY (broad)" }, // Trade Weighted Dollar (substitui ICE DXY legado)
  { id: "DGS10", label: "US10Y" },
  { id: "DGS2", label: "US2Y" }, // short-end mais relevante que US3M p/ curva
  { id: "VIXCLS", label: "VIX" },
];

// Yahoo continua para o que FRED não tem em tempo real: futuros intraday e ETH.
const YAHOO_SYMBOLS = [
  "ES=F", // S&P fut
  "NQ=F", // NASDAQ fut
  "GC=F", // Gold fut
  "CL=F", // Crude fut
  "ETH-USD", // ETH spot
];

async function loadFred(): Promise<FredObservation[] | null> {
  if (fredCache && Date.now() - fredCache.at < FRED_TTL) return fredCache.data;
  const data = await getFredSeries(FRED_SERIES);
  fredCache = { at: Date.now(), data };
  return data;
}

async function loadQuick(): Promise<Omit<MacroResult, "etf_flows">> {
  if (quickCache && Date.now() - quickCache.at < QUICK_TTL) {
    return quickCache.data;
  }
  const [btcPrice, funding, yahoo, fred, fearGreed] = await Promise.all([
    getBtcIndexPrice().catch(() => null),
    getBtcFunding(),
    getYahooQuotes(YAHOO_SYMBOLS),
    loadFred(),
    getCryptoFearGreed(),
  ]);
  const data = {
    btc_price: btcPrice,
    btc_price_observed_at: btcPrice !== null ? Date.now() : null,
    funding,
    fred,
    yahoo,
    fear_greed: fearGreed,
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
