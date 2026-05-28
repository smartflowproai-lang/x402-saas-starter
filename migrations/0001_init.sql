-- ──────────────────────────────────────────────────────────────────────────
-- x402 SaaS Starter — initial Postgres migration.
--
-- Matches `src/lib/db/schema.ts`. Run via `pnpm db:migrate` (drizzle-kit) or
-- apply directly with `psql -f migrations/0001_init.sql $DATABASE_URL`.
--
-- Includes:
--   - enum product_tier (starter | pro)
--   - users         (wallet + email auth)
--   - licenses      (issued license keys, stripe + x402 sources)
--   - sessions      (short-lived auth sessions for the wallet flow)
--   - paid_routes   (per-route pricing — config without redeploy)
-- ──────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Product tier enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_tier') THEN
    CREATE TYPE product_tier AS ENUM ('starter', 'pro');
  END IF;
END$$;

-- users -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT,
  wallet_address  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx
  ON users (email);
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_idx
  ON users (wallet_address);

-- licenses --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS licenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users (id),
  license_key       TEXT NOT NULL,
  product           product_tier NOT NULL,
  source            TEXT NOT NULL, -- 'stripe' | 'x402'
  source_reference  TEXT,
  amount_cents      INTEGER,
  currency          TEXT DEFAULT 'usd',
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS licenses_key_idx
  ON licenses (license_key);
CREATE INDEX IF NOT EXISTS licenses_user_idx
  ON licenses (user_id);

-- sessions --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id),
  token       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx
  ON sessions (token);
CREATE INDEX IF NOT EXISTS sessions_user_idx
  ON sessions (user_id);

-- paid_routes -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS paid_routes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route          TEXT NOT NULL,
  price_usd      TEXT NOT NULL,
  network        TEXT NOT NULL DEFAULT 'eip155:8453',
  description    TEXT,
  enabled        INTEGER NOT NULL DEFAULT 1,
  request_count  BIGINT NOT NULL DEFAULT 0,
  settled_count  BIGINT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS paid_routes_route_idx
  ON paid_routes (route);

-- Seed the four example routes so the starter is functional out of the box.
INSERT INTO paid_routes (route, price_usd, description)
VALUES
  ('GET /api/decision',     '$0.05', 'Token BUY / WATCH / AVOID recommendation'),
  ('GET /api/scraping',     '$0.10', 'Fetch + parse a public URL'),
  ('GET /api/signal',       '$0.02', 'Top token signals snapshot'),
  ('GET /api/custom-route', '$0.05', 'Copy + customize template')
ON CONFLICT (route) DO NOTHING;
