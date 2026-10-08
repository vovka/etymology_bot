export const TIERS = ["free", "basic", "premium"] as const;
export type Tier = (typeof TIERS)[number];
export type PaidTier = Exclude<Tier, "free">;

export const PAID_TIERS: readonly PaidTier[] = ["basic", "premium"];

export function isPaidTier(value: string): value is PaidTier {
  return (PAID_TIERS as readonly string[]).includes(value);
}

export function tierName(tier: Tier): string {
  return tier[0].toUpperCase() + tier.slice(1);
}
