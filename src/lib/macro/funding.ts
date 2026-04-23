const DERIBIT = "https://www.deribit.com/api/v2";

export interface FundingSnapshot {
  /** Taxa de funding anualizada (estimativa), em % */
  annualized_pct: number;
  /** Última taxa de 8h, em % */
  rate_8h_pct: number;
  timestamp: number;
}

/**
 * Funding rate do BTC-PERPETUAL na Deribit.
 * Usa get_funding_rate_value acumulado nas últimas 8h.
 */
export async function getBtcFunding(): Promise<FundingSnapshot | null> {
  try {
    const now = Date.now();
    const eightHoursAgo = now - 8 * 60 * 60 * 1000;
    const url = new URL(`${DERIBIT}/public/get_funding_rate_value`);
    url.searchParams.set("instrument_name", "BTC-PERPETUAL");
    url.searchParams.set("start_timestamp", String(eightHoursAgo));
    url.searchParams.set("end_timestamp", String(now));
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { result: number };
    const rate8h = body.result ?? 0;
    return {
      rate_8h_pct: Math.round(rate8h * 100 * 1000) / 1000,
      annualized_pct: Math.round(rate8h * 100 * (365 * 3) * 10) / 10,
      timestamp: now,
    };
  } catch {
    return null;
  }
}
