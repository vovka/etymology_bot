import type { Context } from "grammy";
import type { Tier } from "../billing/Tier.js";
import type { UserRepository } from "../billing/UserRepository.js";
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
    private readonly services: Record<Tier, EtymologyService>,
    private readonly users: Pick<UserRepository, "tierOf">,
    private readonly rateLimiter: UserRateLimiter,
    private readonly config: AppConfig,
  ) {}

  async handle(ctx: Context, text: string): Promise<void> {
    const query = parseQuery(text, this.config.query);
    if (!query) return void (await ctx.reply(messages.invalidQuery));
    const tier = ctx.from ? await this.users.tierOf(ctx.from.id) : "free";
    const limit = this.config.tiers[tier].requestsPerHour;
    if (ctx.from && !(await this.rateLimiter.tryConsume(ctx.from.id, limit))) {
      return void (await ctx.reply(tier === "free" ? messages.rateLimitedFree : messages.rateLimited));
    }
    const footer = tier === "free" ? messages.upsellFooter : "";
    await answerWith(this.services[tier], ctx, query, this.config.reply.defaultLanguage, "", footer);
  }
}

/** Shows progress while the service works, then replaces it with the answer between header and footer. */
export async function answerWith(
  service: EtymologyService, ctx: Context, query: string, defaultLanguage: string, header: string, footer: string,
): Promise<void> {
  const progress = new ProgressIndicator(ctx);
  const language = replyLanguage(ctx.from?.language_code, defaultLanguage);
  await progress.start();
  try {
    const answer = await service.explain(query, language, (stage) => progress.update(stage));
    await progress.finish(header + formatAnswer(answer) + footer);
  } catch (error) {
    console.error("Etymology lookup failed:", error);
    await progress.fail(error instanceof AllModelsUnavailableError ? messages.unavailable : messages.failed);
  }
}
