export interface YahooQuote {
  symbol: string;
  price: number;
  change_pct: number;
}

/**
 * Yahoo Finance pública. Não requer API key.
 * Symbols úteis: DX-Y.NYB (DXY), ^TNX (US 10Y yield, em % × 10),
 * ES=F (S&P futures), GC=F (gold futures).
 */
export async function getYahooQuotes(symbols: string[]): Promise<YahooQuote[] | null> {
  if (symbols.length === 0) return [];
  try {
    const url = new URL("https://query1.finance.yahoo.com/v7/finance/quote");
    url.searchParams.set("symbols", symbols.join(","));
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        // Yahoo às vezes devolve 401 sem UA parecido de browser.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      quoteResponse?: {
        result?: Array<{
          symbol: string;
          regularMarketPrice?: number;
          regularMarketChangePercent?: number;
        }>;
      };
    };
    const results = body.quoteResponse?.result ?? [];
    return results.map((r) => ({
      symbol: r.symbol,
      price: Math.round((r.regularMarketPrice ?? 0) * 100) / 100,
      change_pct: Math.round((r.regularMarketChangePercent ?? 0) * 100) / 100,
    }));
  } catch {
    return null;
  }
}
