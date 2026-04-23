import { NextResponse } from "next/server";
import { getDeribitAuthInfo } from "@/lib/deribit/client";

export async function GET(): Promise<NextResponse> {
  const info = await getDeribitAuthInfo();
  const status = info.authenticated ? 200 : 401;
  return NextResponse.json(info, { status });
}
