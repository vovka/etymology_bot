import { describe, expect, it, vi } from "vitest";
import type { Api } from "grammy";
import type { SuccessfulPayment } from "grammy/types";
import { Checkout } from "../src/billing/Checkout.js";
import { activeTier, type UserRecord } from "../src/billing/UserRecord.js";
import { loadConfig } from "../src/config/loadConfig.js";

const DAY = 24 * 3600 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY);

function setup(record: UserRecord | null) {
  const api = {
    createInvoiceLink: vi.fn(async () => "https://t.me/$invoice"),
    editUserStarSubscription: vi.fn(async () => true),
  };
  const users = { find: vi.fn(async () => record), recordPayment: vi.fn(async () => {}) };
  const checkout = new Checkout(api as unknown as Api, users, loadConfig().tiers);
  return { checkout, api, users };
}

const payment = (tier: string, extra: Partial<SuccessfulPayment> = {}): SuccessfulPayment => ({
  currency: "XTR", total_amount: 100, invoice_payload: tier, telegram_payment_charge_id: "new",
  provider_payment_charge_id: "", subscription_expiration_date: Math.floor(inDays(30).getTime() / 1000), ...extra,
});

describe("activeTier", () => {
  it("is free without a record or after expiry, and never lapses without an expiry", () => {
    expect(activeTier(null)).toBe("free");
    expect(activeTier({ tier: "basic", expiresAt: inDays(-1), subscriptionChargeId: "x" })).toBe("free");
    expect(activeTier({ tier: "pro", expiresAt: null, subscriptionChargeId: null })).toBe("pro");
  });
});

describe("Checkout", () => {
  it("creates a 30-day Stars subscription link at the configured price", async () => {
    const { checkout, api } = setup(null);
    await checkout.invoiceLink("pro");
    expect(api.createInvoiceLink).toHaveBeenCalledWith(expect.any(String), expect.any(String), "pro", "", "XTR",
      [{ label: expect.any(String), amount: 250 }], { subscription_period: 2592000 });
  });

  it("declines an unknown plan and the plan the user already has, but allows renewing near expiry", async () => {
    expect(await setup(null).checkout.declineReason(1, "gold")).toMatch(/no longer available/);
    const active = { tier: "basic" as const, expiresAt: inDays(20), subscriptionChargeId: "old" };
    expect(await setup(active).checkout.declineReason(1, "basic")).toMatch(/already have/);
    expect(await setup(active).checkout.declineReason(1, "pro")).toBeNull();
    expect(await setup({ ...active, expiresAt: inDays(0.1) }).checkout.declineReason(1, "basic")).toBeNull();
  });

  it("switching plans cancels the old subscription's renewal and stores the new one", async () => {
    const { checkout, api, users } = setup({ tier: "basic", expiresAt: inDays(20), subscriptionChargeId: "old" });
    await checkout.fulfill(7, payment("pro", { is_recurring: true, is_first_recurring: true }));
    expect(api.editUserStarSubscription).toHaveBeenCalledWith(7, "old", true);
    expect(users.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ chargeId: "new", tier: "pro" }),
      expect.objectContaining({ tier: "pro", subscriptionChargeId: "new" }));
  });

  it("a renewal extends the expiry and keeps the subscription's first charge", async () => {
    const { checkout, api, users } = setup({ tier: "basic", expiresAt: inDays(0), subscriptionChargeId: "first" });
    await checkout.fulfill(7, payment("basic", { is_recurring: true }));
    expect(api.editUserStarSubscription).not.toHaveBeenCalled();
    const [, user] = users.recordPayment.mock.calls[0] as unknown as [unknown, UserRecord];
    expect(user.subscriptionChargeId).toBe("first");
    expect(user.expiresAt!.getTime()).toBeGreaterThan(inDays(29).getTime());
  });
});
