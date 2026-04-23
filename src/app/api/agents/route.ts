import { NextResponse } from "next/server";
import { runAgents } from "@/lib/agents/run";
import type { AgentSide } from "@/lib/agents/horizons";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const sideParam = url.searchParams.get("side");
    const side: AgentSide = sideParam === "call" ? "call" : "put";
    const report = await runAgents(side, force);
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
