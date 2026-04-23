import type { StrategyConfig } from "../types";
import { screenCreditSpread } from "./build";

export function screenBearCallSpread(cfg: StrategyConfig) {
  return screenCreditSpread("bear-call-spread", cfg);
}
