import path from "node:path";
import type { AppConfig } from "../config/AppConfig.js";
import { loadPrompt } from "../config/loadPrompt.js";

const TEXTS_DIR = path.join(process.cwd(), "config", "texts");

/** A user-facing text from config/texts, with the plans' prices and limits filled in. */
export function loadText(name: string, tiers: AppConfig["tiers"]): string {
  return loadPrompt(name, planValues(tiers), TEXTS_DIR);
}

function planValues({ free, basic, premium }: AppConfig["tiers"]): Record<string, string> {
  return {
    freeLimit: String(free.requestsPerHour),
    basicLimit: String(basic.requestsPerHour),
    premiumLimit: String(premium.requestsPerHour),
    basicPrice: String(basic.priceStars),
    premiumPrice: String(premium.priceStars),
  };
}
