import { InlineKeyboard, type Bot } from "grammy";
import { TIERS, tierName, type Tier } from "../../billing/Tier.js";
import type { AppConfig } from "../../config/AppConfig.js";
import type { EtymologyService } from "../../etymology/EtymologyService.js";
import { answerWith } from "../EtymologyHandler.js";

/** Buttons under the greeting that answer one demo word on each plan; answers are cached, so no rate limit. */
export class DemoExamples {
  constructor(
    private readonly services: Record<Tier, EtymologyService>,
    private readonly config: AppConfig,
  ) {}

  keyboard(): InlineKeyboard {
    const buttons = TIERS.map((tier) => InlineKeyboard.text(`${tierName(tier)} example`, `demo:${tier}`));
    // Two per row: four labels in one row get cut off on phones.
    return InlineKeyboard.from([buttons.slice(0, 2), buttons.slice(2)]);
  }

  register(bot: Bot): void {
    bot.callbackQuery(new RegExp(`^demo:(${TIERS.join("|")})$`), async (ctx) => {
      await ctx.answerCallbackQuery();
      const tier = ctx.match[1] as Tier;
      const { word } = this.config.demo;
      const header = `<b>Example of a ${tierName(tier)} answer: «${word}»</b>\n\n`;
      await answerWith(this.services[tier], ctx, word, this.config.reply.defaultLanguage, header, "");
    });
  }
}
