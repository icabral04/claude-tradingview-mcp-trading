import { NextRequest, NextResponse } from "next/server";
import { runLeeLowell } from "@/lib/screening/lee-lowell";
import { getCurrentSignal } from "@/lib/signal-store";
import type { SignalBias } from "@/lib/deribit/types";
import rulesJson from "../../../../rules.json" assert { type: "json" };
import type { ScreeningConfig } from "@/lib/screening/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const overrideBias = searchParams.get("bias") as SignalBias | null;

  const signal = getCurrentSignal();
  const bias: SignalBias = overrideBias ?? signal?.bias ?? "neutral";

  try {
    const result = await runLeeLowell(bias, rulesJson.screening as ScreeningConfig);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
