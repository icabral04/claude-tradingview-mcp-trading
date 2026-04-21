import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { SignalBias } from "@/lib/deribit/types";

const STORE_PATH = join(process.cwd(), "signal-store.json");

export interface SignalEntry {
  bias: SignalBias;
  source: string;
  ticker: string;
  timeframe: string;
  price: number;
  indicators: Record<string, number | string>;
  received_at: string;
}

interface SignalStore {
  current: SignalEntry | null;
  history: SignalEntry[];
}

function readStore(): SignalStore {
  if (!existsSync(STORE_PATH)) return { current: null, history: [] };
  return JSON.parse(readFileSync(STORE_PATH, "utf8")) as SignalStore;
}

function writeStore(store: SignalStore): void {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function getCurrentSignal(): SignalEntry | null {
  return readStore().current;
}

export function saveSignal(entry: SignalEntry): void {
  const store = readStore();
  store.history.unshift(entry);
  if (store.history.length > 50) store.history = store.history.slice(0, 50);
  store.current = entry;
  writeStore(store);
}

export function getSignalHistory(): SignalEntry[] {
  return readStore().history;
}
