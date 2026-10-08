import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { Tier } from "./Tier.js";
import { activeTier, type PaymentRecord, type UserRecord } from "./UserRecord.js";

type Sql = NeonQueryFunction<false, false>;

interface UserRow {
  tier: Tier;
  expires_at: Date | string | null;
  subscription_charge_id: string | null;
}

/** Users and payments in Postgres (Neon over HTTP). */
export class UserRepository {
  constructor(private readonly sql: Sql) {}

  async find(userId: number): Promise<UserRecord | null> {
    const rows = (await this.sql`
      SELECT tier, expires_at, subscription_charge_id FROM users WHERE telegram_id = ${userId}`) as UserRow[];
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async tierOf(userId: number): Promise<Tier> {
    return activeTier(await this.find(userId));
  }

  async recordPayment(payment: PaymentRecord, user: UserRecord): Promise<void> {
    await this.sql.transaction([
      this.sql`
        INSERT INTO payments (telegram_payment_charge_id, telegram_id, tier, stars, is_first_recurring, expires_at)
        VALUES (${payment.chargeId}, ${payment.userId}, ${payment.tier}, ${payment.stars},
                ${payment.isFirstRecurring}, ${payment.expiresAt})
        ON CONFLICT (telegram_payment_charge_id) DO NOTHING`,
      this.saveUser(payment.userId, user),
    ]);
  }

  async markRefunded(userId: number, chargeId: string): Promise<void> {
    await this.sql.transaction([
      this.sql`UPDATE payments SET refunded_at = now() WHERE telegram_payment_charge_id = ${chargeId}`,
      this.saveUser(userId, { tier: "free", expiresAt: null, subscriptionChargeId: null }),
    ]);
  }

  private saveUser(userId: number, user: UserRecord) {
    return this.sql`
      INSERT INTO users (telegram_id, tier, expires_at, subscription_charge_id)
      VALUES (${userId}, ${user.tier}, ${user.expiresAt}, ${user.subscriptionChargeId})
      ON CONFLICT (telegram_id) DO UPDATE SET tier = EXCLUDED.tier, expires_at = EXCLUDED.expires_at,
        subscription_charge_id = EXCLUDED.subscription_charge_id, updated_at = now()`;
  }
}

function toRecord(row: UserRow): UserRecord {
  const expiresAt = row.expires_at === null ? null : new Date(row.expires_at);
  return { tier: row.tier, expiresAt, subscriptionChargeId: row.subscription_charge_id };
}
