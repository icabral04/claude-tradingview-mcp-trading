export interface FredObservation {
  series_id: string;
  label: string;
  value: number;
  /** Data da observação (YYYY-MM-DD, fuso ET). */
  date: string;
  /** Variação % vs observação anterior (útil p/ tone no UI). */
  change_pct: number | null;
  /** ms epoch aprox. do fechamento da observação (assume 17:00 America/New_York). */
  observed_at: number;
}

export interface FredSeriesSpec {
  id: string;
  label: string;
}

const BASE = "https://api.stlouisfed.org/fred/series/observations";

/**
 * FRED é diário: cada série publica 1 observação por dia útil ET, normalmente após
 * o fechamento. Pegamos as 2 últimas válidas p/ calcular change_pct.
 *
 * Requer FRED_API_KEY. Retorna null em erro (fallback para Yahoo fica por conta do caller).
 */
export async function getFredSeries(specs: FredSeriesSpec[]): Promise<FredObservation[] | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;

  try {
    const results = await Promise.all(
      specs.map(async (spec): Promise<FredObservation | null> => {
        const url = new URL(BASE);
        url.searchParams.set("series_id", spec.id);
        url.searchParams.set("api_key", key);
        url.searchParams.set("file_type", "json");
        url.searchParams.set("sort_order", "desc");
        url.searchParams.set("limit", "10");
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) return null;
        const body = (await res.json()) as {
          observations?: Array<{ date: string; value: string }>;
        };
        const obs = (body.observations ?? []).filter((o) => o.value !== "." && o.value !== "");
        if (obs.length === 0) return null;
        const latest = obs[0];
        const prev = obs[1];
        const value = Number(latest.value);
        if (!Number.isFinite(value)) return null;
        const prevValue = prev ? Number(prev.value) : NaN;
        const change_pct =
          Number.isFinite(prevValue) && prevValue !== 0
            ? Math.round(((value - prevValue) / Math.abs(prevValue)) * 10_000) / 100
            : null;
        // FRED retorna YYYY-MM-DD (data da observação, fuso ET).
        // Marca 21:00 UTC como proxy do fechamento NY (17:00 ET).
        const observed_at = Date.parse(`${latest.date}T21:00:00Z`);
        return {
          series_id: spec.id,
          label: spec.label,
          value: Math.round(value * 100) / 100,
          date: latest.date,
          change_pct,
          observed_at: Number.isFinite(observed_at) ? observed_at : Date.now(),
        };
      })
    );
    return results.filter((r): r is FredObservation => r !== null);
  } catch {
    return null;
  }
}
