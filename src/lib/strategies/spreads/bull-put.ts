import type { StrategyConfig } from "../types";
import { screenCreditSpread } from "./build";

export function screenBullPutSpread(cfg: StrategyConfig) {
  return screenCreditSpread("bull-put-spread", cfg);
}
