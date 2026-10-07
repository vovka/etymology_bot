// Usage: npm run set-webhook -- https://your-app.vercel.app
import { Bot } from "grammy";
import { requireEnv } from "../src/utils/requireEnv.js";

const baseUrl = process.argv[2];
if (!baseUrl) throw new Error("Pass the deployment URL, e.g. npm run set-webhook -- https://your-app.vercel.app");

const bot = new Bot(requireEnv("TELEGRAM_BOT_TOKEN"));
const url = `${baseUrl.replace(/\/$/, "")}/api/telegram`;
await bot.api.setWebhook(url, {
  secret_token: requireEnv("TELEGRAM_WEBHOOK_SECRET"),
  allowed_updates: ["message"],
  drop_pending_updates: true,
});
console.log(`Webhook set to ${url}`);
