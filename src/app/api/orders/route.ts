import { NextRequest, NextResponse } from "next/server";
import { placeMultiLeg, sellOption } from "@/lib/deribit/client";

interface SingleOrderBody {
  instrument_name: string;
  amount: number;
  type: "limit" | "market";
  price?: number;
  label?: string;
}

interface MultiLegBody {
  legs: Array<{
    instrument_name: string;
    direction: "buy" | "sell";
    amount: number;
    price?: number;
  }>;
  type: "limit" | "market";
  label?: string;
  post_only?: boolean;
}

function isMultiLeg(body: unknown): body is MultiLegBody {
  return typeof body === "object" && body !== null && Array.isArray((body as MultiLegBody).legs);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  try {
    if (isMultiLeg(body)) {
      if (body.legs.length === 0) {
        return NextResponse.json({ error: "legs não pode ser vazio" }, { status: 400 });
      }
      if (body.type === "limit" && body.legs.some((l) => l.price === undefined)) {
        return NextResponse.json({ error: "todas as legs precisam de price em ordens limit" }, { status: 400 });
      }
      const result = await placeMultiLeg({
        legs: body.legs,
        type: body.type,
        label: body.label ?? `combo-${Date.now()}`,
        ...(body.post_only !== undefined && { post_only: body.post_only }),
      });
      return NextResponse.json(result);
    }

    const single = body as SingleOrderBody;
    if (!single.instrument_name || !single.amount || !single.type) {
      return NextResponse.json(
        { error: "instrument_name, amount e type são obrigatórios" },
        { status: 400 }
      );
    }
    if (single.type === "limit" && !single.price) {
      return NextResponse.json({ error: "price é obrigatório para ordens limit" }, { status: 400 });
    }
    const result = await sellOption({
      instrument_name: single.instrument_name,
      amount: single.amount,
      type: single.type,
      ...(single.price !== undefined && { price: single.price }),
      label: single.label ?? "manual",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao colocar ordem";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
