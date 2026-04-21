import { NextRequest, NextResponse } from "next/server";
import { sellOption } from "@/lib/deribit/client";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { instrument_name, amount, type, price, label } = body as {
    instrument_name: string;
    amount: number;
    type: "limit" | "market";
    price?: number;
    label?: string;
  };

  if (!instrument_name || !amount || !type) {
    return NextResponse.json(
      { error: "instrument_name, amount e type são obrigatórios" },
      { status: 400 }
    );
  }

  if (type === "limit" && !price) {
    return NextResponse.json(
      { error: "price é obrigatório para ordens limit" },
      { status: 400 }
    );
  }

  try {
    const result = await sellOption({
      instrument_name,
      amount,
      type,
      ...(price !== undefined && { price }),
      label: label ?? "lee-lowell",
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao colocar ordem";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
