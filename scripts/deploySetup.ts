// The Vercel build command. On production builds it brings the database schema and Telegram's bot settings
// (webhook, allowed updates, command menu, descriptions) up to date; preview builds skip it.
import { neon } from "@neondatabase/serverless";
import { Api } from "grammy";
import { applySchema } from "../src/billing/applySchema.js";
import { configureTelegram } from "../src/bot/configureTelegram.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { requireEnv } from "../src/utils/requireEnv.js";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Not a production build: skipping database and Telegram setup");
} else {
  await applySchema(neon(requireEnv("DATABASE_URL")));
  console.log("Database schema applied");
  const api = new Api(requireEnv("TELEGRAM_BOT_TOKEN"));
  const baseUrl = `https://${requireEnv("VERCEL_PROJECT_PRODUCTION_URL")}`;
  const url = await configureTelegram(api, baseUrl, loadConfig().tiers, false);
  console.log(`Webhook set to ${url}`, await api.getWebhookInfo());
}
