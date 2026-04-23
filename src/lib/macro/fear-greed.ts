export interface FearGreedSnapshot {
  value: number;
  classification: string;
  timestamp: number;
}

/**
 * Crypto Fear & Greed Index (alternative.me). Público, sem key.
 * Valor 0–100: 0 = extreme fear, 100 = extreme greed.
 */
export async function getCryptoFearGreed(): Promise<FearGreedSnapshot | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Array<{
        value?: string;
        value_classification?: string;
        timestamp?: string;
      }>;
    };
    const first = body.data?.[0];
    if (!first || !first.value) return null;
    return {
      value: Number(first.value),
      classification: first.value_classification ?? "",
      timestamp: Number(first.timestamp ?? 0) * 1000,
    };
  } catch {
    return null;
  }
}
