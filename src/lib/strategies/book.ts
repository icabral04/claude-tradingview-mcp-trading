import { getBtcOptions, getTicker, getBtcIndexPrice } from "@/lib/deribit/client";
import type { DeribitInstrument, OptionType } from "@/lib/deribit/types";
import type { EnrichedQuote, Leg } from "./types";
import { round } from "./math";

// Cache em memória de processo. Evita martelar Deribit a cada call da API
// quando o usuário alterna entre estratégias no dashboard.
interface Cached {
  fetchedAt: number;
  spot: number;
  quotes: EnrichedQuote[];
}
let CACHE: Cached | null = null;
const TTL_MS = 30_000;

export function invalidateBookCache(): void {
  CACHE = null;
}

function calcDte(expiryMs: number): number {
  return (expiryMs - Date.now()) / (1000 * 60 * 60 * 24);
}

/**
 * Carrega todos os instrumentos ativos de BTC + tickers em batch.
 * Retorna preço efetivo (bid se > 0, senão mark) para permitir que o
 * screener trabalhe mesmo quando o book está com bid zerado.
 */
export async function loadBook(dteMin: number, dteMax: number): Promise<{ spot: number; quotes: EnrichedQuote[] }> {
  if (CACHE && Date.now() - CACHE.fetchedAt < TTL_MS) {
    const quotes = CACHE.quotes.filter((q) => q.dte >= dteMin && q.dte <= dteMax);
    return { spot: CACHE.spot, quotes };
  }

  const [instruments, spot] = await Promise.all([getBtcOptions(), getBtcIndexPrice()]);

  // Janela superior 60 cobre todos os DEFAULT_CONFIGS (max 45 + folga). Ampliar
  // se algum perfil de estratégia passar a usar DTE maior — caso contrário,
  // estaríamos puxando ticker de 100+ contratos trimestrais sem necessidade.
  const preCandidates = instruments.filter((inst: DeribitInstrument) => {
    if (!inst.is_active) return false;
    const dte = calcDte(inst.expiration_timestamp);
    return dte >= 5 && dte <= 60;
  });

  // Concurrency cap para não estourar rate limit Deribit (~20 req/s público).
  const concurrency = 12;
  const quotes: EnrichedQuote[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < preCandidates.length) {
      const idx = cursor++;
      const inst = preCandidates[idx];
      try {
        const ticker = await getTicker(inst.instrument_name);
        const bid = ticker.bid_price ?? 0;
        const mark = ticker.mark_price ?? 0;
        const price = bid > 0 ? bid : mark;
        if (price <= 0) continue;
        quotes.push({
          instrument: inst,
          ticker,
          dte: calcDte(inst.expiration_timestamp),
          price,
          price_source: bid > 0 ? "bid" : "mark",
        });
      } catch {
        // ignora ticker individual com erro
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  CACHE = { fetchedAt: Date.now(), spot, quotes };
  const filtered = quotes.filter((q) => q.dte >= dteMin && q.dte <= dteMax);
  return { spot, quotes: filtered };
}

export function filterByType(quotes: EnrichedQuote[], type: OptionType): EnrichedQuote[] {
  return quotes.filter((q) => q.instrument.option_type === type);
}

export function groupByExpiry(quotes: EnrichedQuote[]): Map<number, EnrichedQuote[]> {
  const out = new Map<number, EnrichedQuote[]>();
  for (const q of quotes) {
    const arr = out.get(q.instrument.expiration_timestamp) ?? [];
    arr.push(q);
    out.set(q.instrument.expiration_timestamp, arr);
  }
  return out;
}

export function quoteToLeg(q: EnrichedQuote, direction: "sell" | "buy"): Leg {
  const t = q.ticker;
  return {
    instrument_name: q.instrument.instrument_name,
    option_type: q.instrument.option_type,
    strike: q.instrument.strike,
    direction,
    dte: round(q.dte, 1),
    delta: t.greeks?.delta ?? 0,
    gamma: t.greeks?.gamma ?? 0,
    theta: t.greeks?.theta ?? 0,
    vega: t.greeks?.vega ?? 0,
    mark_iv: t.mark_iv ?? 0,
    price: q.price,
    price_source: q.price_source,
    bid_price: t.bid_price ?? 0,
    ask_price: t.ask_price ?? 0,
    mark_price: t.mark_price ?? 0,
    open_interest: t.open_interest ?? 0,
  };
}
