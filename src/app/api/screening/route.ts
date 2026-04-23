import { NextRequest, NextResponse } from "next/server";
import { runStrategy, STRATEGIES, DEFAULT_CONFIGS } from "@/lib/strategies/registry";
import type { StrategyConfig, StrategyId } from "@/lib/strategies/types";
import { getCurrentSignal } from "@/lib/signal-store";
import rulesJson from "../../../../rules.json" assert { type: "json" };

const VALID_STRATEGIES = Object.keys(STRATEGIES) as StrategyId[];

function pickStrategyFromBias(bias: string | null | undefined): StrategyId {
  if (bias === "bullish") return "sell-put";
  if (bias === "bearish") return "sell-call";
  if (bias === "neutral") return "iron-condor";
  return "sell-put";
}

function resolveConfig(strategy: StrategyId): StrategyConfig {
  const stored = (rulesJson as { strategies?: Record<string, Partial<StrategyConfig>> }).strategies;
  const fromFile = stored?.[strategy];
  return { ...DEFAULT_CONFIGS[strategy], ...(fromFile ?? {}) };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const explicit = searchParams.get("strategy") as StrategyId | null;
  const biasOverride = searchParams.get("bias");

  const strategy: StrategyId =
    explicit && VALID_STRATEGIES.includes(explicit)
      ? explicit
      : pickStrategyFromBias(biasOverride ?? getCurrentSignal()?.bias);

  const cfg = resolveConfig(strategy);
  const meta = STRATEGIES[strategy];

  try {
    const result = await runStrategy(strategy, cfg);
    return NextResponse.json({
      strategy,
      strategy_meta: meta,
      bias: meta.bias,
      btc_price: result.spot,
      screened_at: new Date().toISOString(),
      trades: result.trades,
      stats: result.stats,
      config_used: cfg,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message, strategy }, { status: 500 });
  }
}
