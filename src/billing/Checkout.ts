import type { Api } from "grammy";
import type { SuccessfulPayment } from "grammy/types";
import type { AppConfig } from "../config/AppConfig.js";
import { isPaidTier, tierName, type PaidTier } from "./Tier.js";
import { activeTier, type UserRecord } from "./UserRecord.js";
import type { UserRepository } from "./UserRepository.js";

// Telegram accepts only 30-day periods for Star subscriptions.
const SUBSCRIPTION_PERIOD_SECONDS = 2592000;
// A renewal may be checked out around the expiry time; only refuse a purchase while the period is well underway.
const RENEWAL_WINDOW_MS = 24 * 3600 * 1000;

const DESCRIPTIONS: Record<PaidTier, string> = {
  basic: "Etymology answers written by Claude Haiku from Wiktionary, Etymonline and Wikipedia. Renews monthly.",
  premium: "Claude Haiku researches each word in depth with dictionary and Wikipedia tools. Renews monthly.",
};

/** Monthly Telegram Stars subscriptions: invoice links, pre-checkout checks and granting the paid tier. */
export class Checkout {
  constructor(
    private readonly api: Api,
    private readonly users: Pick<UserRepository, "find" | "recordPayment">,
    private readonly tiers: AppConfig["tiers"],
  ) {}

  /** Subscriptions can only be sold through invoice links (sendInvoice has no subscription period). */
  invoiceLink(tier: PaidTier): Promise<string> {
    const title = `${tierName(tier)} plan`;
    const price = { label: `${title}, 30 days`, amount: this.tiers[tier].priceStars };
    const period = { subscription_period: SUBSCRIPTION_PERIOD_SECONDS };
    return this.api.createInvoiceLink(title, DESCRIPTIONS[tier], tier, "", "XTR", [price], period);
  }

  /** Why the purchase must be declined, or null to accept it. */
  async declineReason(userId: number, payload: string): Promise<string | null> {
    if (!isPaidTier(payload)) return "This plan is no longer available. Please use /upgrade again.";
    const record = await this.users.find(userId);
    if (activeTier(record) !== payload || isNearExpiry(record!)) return null;
    return `You already have the ${tierName(payload)} plan. See /plan.`;
  }

  /** Records the payment; a new subscription replaces the previous one, whose renewal is canceled. */
  async fulfill(userId: number, payment: SuccessfulPayment): Promise<PaidTier> {
    const tier = payment.invoice_payload as PaidTier;
    const previous = await this.users.find(userId);
    const isFirstRecurring = payment.is_first_recurring ?? false;
    if (isFirstRecurring) await this.cancelRenewal(userId, previous);
    const chargeId = payment.telegram_payment_charge_id;
    const expiresAt = expirationOf(payment);
    const subscriptionChargeId = isFirstRecurring ? chargeId : (previous?.subscriptionChargeId ?? chargeId);
    const record = { userId, chargeId, tier, stars: payment.total_amount, isFirstRecurring, expiresAt };
    await this.users.recordPayment(record, { tier, expiresAt, subscriptionChargeId });
    return tier;
  }

  private async cancelRenewal(userId: number, previous: UserRecord | null): Promise<void> {
    if (!previous?.subscriptionChargeId) return;
    // The old subscription may have ended already; the new one must be granted either way.
    await this.api.editUserStarSubscription(userId, previous.subscriptionChargeId, true)
      .catch((error) => console.error("Could not cancel the previous subscription:", error));
  }
}

function isNearExpiry(record: UserRecord): boolean {
  return record.expiresAt !== null && record.expiresAt.getTime() - Date.now() < RENEWAL_WINDOW_MS;
}

function expirationOf(payment: SuccessfulPayment): Date {
  const seconds = payment.subscription_expiration_date ?? Date.now() / 1000 + SUBSCRIPTION_PERIOD_SECONDS;
  return new Date(seconds * 1000);
}
