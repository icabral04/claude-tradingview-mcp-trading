import { NextResponse } from "next/server";
import { getDvolAndIvRank } from "@/lib/deribit/client";

export async function GET(): Promise<NextResponse> {
  try {
    const data = await getDvolAndIvRank();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
