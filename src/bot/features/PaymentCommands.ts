import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { Checkout } from "../../billing/Checkout.js";
import { PAID_TIERS, tierName } from "../../billing/Tier.js";
import { activeTier } from "../../billing/UserRecord.js";
import type { UserRepository } from "../../billing/UserRepository.js";
import type { AppConfig } from "../../config/AppConfig.js";
import { messages } from "../messages.js";
import { loadText } from "../texts.js";

/** /plan, /upgrade and the Telegram Stars checkout updates. */
export class PaymentCommands {
  constructor(
    private readonly checkout: Checkout,
    private readonly users: Pick<UserRepository, "find">,
    private readonly tiers: AppConfig["tiers"],
  ) {}

  register(bot: Bot): void {
    bot.command("plan", (ctx) => this.showPlan(ctx));
    bot.command("upgrade", (ctx) => this.showUpgrade(ctx));
    bot.on("pre_checkout_query", async (ctx) => {
      const reason = await this.checkout.declineReason(ctx.from.id, ctx.preCheckoutQuery.invoice_payload);
      await ctx.answerPreCheckoutQuery(reason === null, reason ?? undefined);
    });
    bot.on("message:successful_payment", async (ctx) => {
      const payment = ctx.msg.successful_payment;
      const tier = await this.checkout.fulfill(ctx.from.id, payment);
      if (payment.is_first_recurring) await ctx.reply(messages.thanks(tierName(tier)));
    });
  }

  private async showPlan(ctx: Context): Promise<void> {
    if (!ctx.from) return;
    const record = await this.users.find(ctx.from.id);
    const tier = activeTier(record);
    const lines = [`Your plan: <b>${tierName(tier)}</b>`];
    if (tier !== "free" && record?.expiresAt) lines.push(`Paid through ${record.expiresAt.toISOString().slice(0, 10)}`);
    lines.push(`Your Telegram ID: <code>${ctx.from.id}</code>`, "", "Compare plans and subscribe: /upgrade");
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  }

  private async showUpgrade(ctx: Context): Promise<void> {
    const buttons = await Promise.all(PAID_TIERS.map(async (tier) => {
      const label = `${tierName(tier)}: ${this.tiers[tier].priceStars} ⭐ a month`;
      return [InlineKeyboard.url(label, await this.checkout.invoiceLink(tier))];
    }));
    const text = loadText("upgrade", this.tiers);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: InlineKeyboard.from(buttons) });
  }
}
