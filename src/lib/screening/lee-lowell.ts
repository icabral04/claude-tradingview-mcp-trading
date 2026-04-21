import { getBtcOptions, getBtcIndexPrice, getTicker } from "@/lib/deribit/client";
import type { SignalBias, OptionType, DeribitInstrument } from "@/lib/deribit/types";
import type { ScreeningConfig, ScreenedOption, ScreeningResult } from "./types";

function calcDte(expirationTimestamp: number): number {
  return (expirationTimestamp - Date.now()) / (1000 * 60 * 60 * 24);
}

function targetOptionType(signal: SignalBias, config: ScreeningConfig): OptionType | "both" {
  if (signal === "bullish") return "put";
  if (signal === "bearish") return "call";
  return "both";
}

// Lee Lowell score: prioriza alta IV + delta próximo ao centro do range + mais DTE
function scoreOption(opt: ScreenedOption, config: ScreeningConfig): number {
  const deltaCenter = (config.delta_min + config.delta_max) / 2;
  const deltaDist = 1 - Math.abs(Math.abs(opt.delta) - deltaCenter) / deltaCenter;
  const ivScore = Math.min(opt.mark_iv / 100, 2);
  const dteScore = 1 - Math.abs(opt.dte - 30) / 30;
  return deltaDist * 0.4 + ivScore * 0.4 + dteScore * 0.2;
}

export async function runLeeLowell(
  signal: SignalBias,
  config: ScreeningConfig
): Promise<ScreeningResult> {
  const [instruments, btcPrice] = await Promise.all([
    getBtcOptions(),
    getBtcIndexPrice(),
  ]);

  const typeTarget = targetOptionType(signal, config);
  const now = Date.now();

  const candidates = instruments.filter((inst: DeribitInstrument) => {
    if (!inst.is_active) return false;
    const dte = calcDte(inst.expiration_timestamp);
    if (dte < config.dte_min || dte > config.dte_max) return false;
    if (typeTarget !== "both" && inst.option_type !== typeTarget) return false;
    return true;
  });

  // Busca tickers em paralelo (máx 50 para não sobrecarregar)
  const batch = candidates.slice(0, 80);
  const tickerResults = await Promise.allSettled(
    batch.map((inst) => getTicker(inst.instrument_name))
  );

  const screened: ScreenedOption[] = [];

  for (let i = 0; i < batch.length; i++) {
    const result = tickerResults[i];
    if (result.status === "rejected") continue;

    const ticker = result.value;
    const inst = batch[i];

    const delta = Math.abs(ticker.greeks?.delta ?? 0);
    if (delta < config.delta_min || delta > config.delta_max) continue;
    if (ticker.mark_iv < config.iv_min) continue;
    if (!ticker.bid_price || ticker.bid_price < config.min_bid) continue;
    if (ticker.open_interest < config.min_open_interest) continue;

    const dte = calcDte(inst.expiration_timestamp);
    const otm_pct = Math.abs((inst.strike - btcPrice) / btcPrice) * 100;
    const profit_target = (ticker.bid_price ?? ticker.mark_price) * (config.profit_target_pct / 100);

    const opt: ScreenedOption = {
      instrument_name: inst.instrument_name,
      option_type: inst.option_type,
      strike: inst.strike,
      expiration_timestamp: inst.expiration_timestamp,
      dte: Math.round(dte * 10) / 10,
      mark_iv: Math.round(ticker.mark_iv * 10) / 10,
      bid_price: ticker.bid_price ?? 0,
      ask_price: ticker.ask_price ?? 0,
      mark_price: ticker.mark_price,
      delta: ticker.greeks?.delta ?? 0,
      gamma: ticker.greeks?.gamma ?? 0,
      theta: ticker.greeks?.theta ?? 0,
      vega: ticker.greeks?.vega ?? 0,
      open_interest: ticker.open_interest,
      underlying_price: btcPrice,
      otm_pct: Math.round(otm_pct * 10) / 10,
      profit_target: Math.round(profit_target * 10000) / 10000,
      score: 0,
    };

    opt.score = Math.round(scoreOption(opt, config) * 100) / 100;
    screened.push(opt);
  }

  screened.sort((a, b) => b.score - a.score);

  return {
    signal,
    btc_price: btcPrice,
    screened_at: new Date().toISOString(),
    option_type_target: typeTarget,
    options: screened.slice(0, 20),
  };
}
