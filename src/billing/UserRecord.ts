import type { Tier } from "./Tier.js";

export interface UserRecord {
  tier: Tier;
  /** null: the tier never expires (set by hand). */
  expiresAt: Date | null;
  subscriptionChargeId: string | null;
}

export interface PaymentRecord {
  userId: number;
  chargeId: string;
  tier: Tier;
  stars: number;
  isFirstRecurring: boolean;
  expiresAt: Date | null;
}

/** No record, or a paid period that has run out, means the free tier. */
export function activeTier(record: UserRecord | null, now = new Date()): Tier {
  if (!record) return "free";
  return record.expiresAt && record.expiresAt <= now ? "free" : record.tier;
}
