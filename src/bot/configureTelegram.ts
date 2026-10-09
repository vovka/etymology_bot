import type { Api } from "grammy";
import type { AppConfig } from "../config/AppConfig.js";
import { requireEnv } from "../utils/requireEnv.js";
import { loadText } from "./texts.js";

// Payments need pre_checkout_query (successful payments arrive as messages); the demo buttons need callback_query.
const ALLOWED_UPDATES = ["message", "pre_checkout_query", "callback_query"] as const;

const COMMANDS = [
  { command: "start", description: "What the bot does, plans and examples" },
  { command: "plan", description: "Your current plan" },
  { command: "upgrade", description: "Subscribe to Basic, Pro or Unlimited" },
  { command: "etym", description: "Look up a word (in group chats)" },
  { command: "terms", description: "Terms of service" },
  { command: "privacy", description: "Privacy" },
  { command: "support", description: "Write to support" },
  { command: "paysupport", description: "Help with payments and refunds" },
];

/** Points Telegram at the webhook and sets the bot's command menu and the texts shown before /start. */
export async function configureTelegram(
  api: Api, baseUrl: string, tiers: AppConfig["tiers"], dropPendingUpdates: boolean,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/telegram`;
  await api.setWebhook(url, {
    secret_token: requireEnv("TELEGRAM_WEBHOOK_SECRET"),
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: dropPendingUpdates,
  });
  await api.setMyCommands(COMMANDS);
  await api.setMyDescription(loadText("description", tiers));
  await api.setMyShortDescription(loadText("short-description", tiers));
  return url;
}
