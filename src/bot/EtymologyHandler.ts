import type { Context } from "grammy";
import type { AppConfig } from "../config/AppConfig.js";
import type { EtymologyService } from "../etymology/EtymologyService.js";
import { parseQuery } from "../etymology/parseQuery.js";
import { AllModelsUnavailableError } from "../llm/ModelChain.js";
import { messages } from "./messages.js";
import { ProgressIndicator } from "./ProgressIndicator.js";
import { replyLanguage } from "./replyLanguage.js";
import { formatAnswer } from "./toTelegramHtml.js";
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
    await this.answer(ctx, query, new ProgressIndicator(ctx));
  }

  private async answer(ctx: Context, query: string, progress: ProgressIndicator): Promise<void> {
    const language = replyLanguage(ctx.from?.language_code, this.config.reply.defaultLanguage);
    await progress.start();
    try {
      const answer = await this.service.explain(query, language, (stage) => progress.update(stage));
      await progress.finish(formatAnswer(answer));
    } catch (error) {
      console.error("Etymology lookup failed:", error);
      await progress.fail(error instanceof AllModelsUnavailableError ? messages.unavailable : messages.failed);
    }
  }
}
