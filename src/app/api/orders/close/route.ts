import { NextRequest, NextResponse } from "next/server";
import { closePosition } from "@/lib/deribit/client";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { instrument_name, amount, type, price } = body as {
    instrument_name: string;
    amount: number;
    type?: "limit" | "market";
    price?: number;
  };

  if (!instrument_name || !amount) {
    return NextResponse.json(
      { error: "instrument_name e amount são obrigatórios" },
      { status: 400 }
    );
  }

  try {
    const result = await closePosition(instrument_name, amount, type ?? "market", price);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao fechar posição";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
