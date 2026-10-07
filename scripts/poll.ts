// Local development with long polling. Removes the webhook, so run set-webhook again after testing.
import { createApp } from "../src/app.js";

const bot = createApp();
await bot.api.deleteWebhook();
console.log("Bot is polling. Press Ctrl+C to stop.");
await bot.start();
