import type { Context } from "grammy";
import type { AppConfig } from "../config/AppConfig.js";
import type { EtymologyService } from "../etymology/EtymologyService.js";
import { parseQuery } from "../etymology/parseQuery.js";
import { AllModelsUnavailableError } from "../llm/ModelChain.js";
import { messages } from "./messages.js";
import { replyLanguage } from "./replyLanguage.js";
import { stripTags, toTelegramHtml } from "./toTelegramHtml.js";
import type { UserRateLimiter } from "./UserRateLimiter.js";

export class EtymologyHandler {
  constructor(
    private readonly service: EtymologyService,
    private readonly rateLimiter: UserRateLimiter,
    private readonly config: AppConfig,
  ) {}

  async handle(ctx: Context, text: string): Promise<void> {
    const query = parseQuery(text, this.config.query);
    if (!query) return void (await ctx.reply(messages.invalidQuery));
    if (ctx.from && !(await this.rateLimiter.tryConsume(ctx.from.id))) {
      return void (await ctx.reply(messages.rateLimited));
    }
    await ctx.replyWithChatAction("typing");
    await this.replyWithAnswer(ctx, query);
  }

  private async replyWithAnswer(ctx: Context, query: string): Promise<void> {
    const language = replyLanguage(ctx.from?.language_code, this.config.reply.defaultLanguage);
    try {
      await this.sendHtml(ctx, toTelegramHtml(await this.service.explain(query, language)));
    } catch (error) {
      console.error("Etymology lookup failed:", error);
      await ctx.reply(error instanceof AllModelsUnavailableError ? messages.unavailable : messages.failed);
    }
  }

  /** Falls back to plain text if Telegram rejects the markup (e.g. a tag cut off by truncation). */
  private async sendHtml(ctx: Context, html: string): Promise<void> {
    try {
      await ctx.reply(html, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(stripTags(html));
    }
  }
}
