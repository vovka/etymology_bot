-- Applied on every production build (scripts/deploySetup.ts) and by `npm run db:setup`; every statement is idempotent.
-- A user without a row is on the free tier, so rows exist only for paying users and users set by hand.

CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'premium')),
  -- NULL means the tier never expires (set by hand); a paid tier lapses to free after this time.
  expires_at TIMESTAMPTZ,
  -- The first payment of the active subscription, needed to cancel its renewal on a tier switch.
  subscription_charge_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every successful payment, kept for refunds and disputes.
CREATE TABLE IF NOT EXISTS payments (
  telegram_payment_charge_id TEXT PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  tier TEXT NOT NULL,
  stars INTEGER NOT NULL,
  is_first_recurring BOOLEAN NOT NULL,
  expires_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The bot owner, preseeded so the tier can be switched by hand for testing.
INSERT INTO users (telegram_id, tier) VALUES (434699468, 'free') ON CONFLICT (telegram_id) DO NOTHING;
