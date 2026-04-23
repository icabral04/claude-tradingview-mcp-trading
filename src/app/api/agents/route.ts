import { NextResponse } from "next/server";
import { runAgents } from "@/lib/agents/run";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const report = await runAgents(force);
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
