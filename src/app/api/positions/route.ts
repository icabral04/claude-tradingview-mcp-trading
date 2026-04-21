import { NextResponse } from "next/server";
import { getOpenPositions } from "@/lib/deribit/client";

export async function GET(): Promise<NextResponse> {
  try {
    const positions = await getOpenPositions();
    return NextResponse.json(positions);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao buscar posições";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
