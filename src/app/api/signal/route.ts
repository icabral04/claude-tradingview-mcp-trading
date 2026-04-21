import { NextResponse } from "next/server";
import { getCurrentSignal, getSignalHistory } from "@/lib/signal-store";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    current: getCurrentSignal(),
    history: getSignalHistory().slice(0, 10),
  });
}
