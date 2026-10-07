import { Bot } from "grammy";
import type { EtymologyHandler } from "./EtymologyHandler.js";
import { messages } from "./messages.js";

export function createBot(token: string, handler: EtymologyHandler): Bot {
  const bot = new Bot(token);
  bot.command(["start", "help"], (ctx) => ctx.reply(messages.welcome));
  bot.command("etym", (ctx) => handler.handle(ctx, ctx.match));
  bot.chatType("private").on("message:text", (ctx) => {
    if (!ctx.msg.text.startsWith("/")) return handler.handle(ctx, ctx.msg.text);
  });
  bot.chatType(["group", "supergroup"]).on("message:text", (ctx) => {
    const mention = `@${ctx.me.username}`;
    if (ctx.msg.text.includes(mention)) return handler.handle(ctx, ctx.msg.text.replace(mention, ""));
  });
  bot.catch((error) => console.error("Unhandled bot error:", error.error));
  return bot;
}
