// Usage: npm run set-webhook -- https://your-app.vercel.app
import { Api } from "grammy";
import { configureTelegram } from "../src/bot/configureTelegram.js";
import { loadConfig } from "../src/config/loadConfig.js";
import { requireEnv } from "../src/utils/requireEnv.js";

const baseUrl = process.argv[2];
if (!baseUrl) throw new Error("Pass the deployment URL, e.g. npm run set-webhook -- https://your-app.vercel.app");

const api = new Api(requireEnv("TELEGRAM_BOT_TOKEN"));
const url = await configureTelegram(api, baseUrl, loadConfig().tiers, true);
console.log(`Webhook set to ${url}`);
