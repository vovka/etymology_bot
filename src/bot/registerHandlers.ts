import type { Bot } from "grammy";
import type { AppConfig } from "../config/AppConfig.js";
import type { EtymologyHandler } from "./EtymologyHandler.js";
import type { DemoExamples } from "./features/DemoExamples.js";
import type { PaymentCommands } from "./features/PaymentCommands.js";
import type { SupportRelay } from "./features/SupportRelay.js";
import { loadText } from "./texts.js";

export interface BotFeatures {
  etymology: EtymologyHandler;
  payments: PaymentCommands;
  support: SupportRelay;
  demos: DemoExamples;
}

export function registerHandlers(bot: Bot, features: BotFeatures, config: AppConfig): Bot {
  const html = { parse_mode: "HTML" as const };
  const welcome = { ...html, reply_markup: features.demos.keyboard() };
  bot.command(["start", "help"], (ctx) => ctx.reply(loadText("welcome", config.tiers), welcome));
  bot.command("terms", (ctx) => ctx.reply(loadText("terms", config.tiers), html));
  bot.command("privacy", (ctx) => ctx.reply(loadText("privacy", config.tiers), html));
  features.payments.register(bot);
  features.demos.register(bot);
  // Before the plain-text handlers below, so the admin's replies to support messages are relayed, not looked up.
  features.support.register(bot);
  bot.command("etym", (ctx) => features.etymology.handle(ctx, ctx.match));
  bot.chatType("private").on("message:text", (ctx) => {
    if (!ctx.msg.text.startsWith("/")) return features.etymology.handle(ctx, ctx.msg.text);
  });
  bot.chatType(["group", "supergroup"]).on("message:text", (ctx) => {
    const mention = `@${ctx.me.username}`;
    if (ctx.msg.text.includes(mention)) return features.etymology.handle(ctx, ctx.msg.text.replace(mention, ""));
  });
  bot.catch((error) => console.error("Unhandled bot error:", error.error));
  return bot;
}
