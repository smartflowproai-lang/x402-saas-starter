/**
 * Postgres schema (Drizzle ORM) for x402 SaaS Starter.
 *
 * Four tables cover the production flow:
 *   - users         — anyone who signs in via Solana wallet or Stripe Checkout
 *   - licenses      — issued license keys (Stripe + native x402)
 *   - sessions      — short-lived auth sessions for the wallet flow
 *   - paid_routes   — per-route pricing, allowing config changes without redeploy
 *
 * Run `npm run db:generate` to emit a fresh migration after schema changes
 * (see drizzle.config.ts).
 */

import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const productTier = pgEnum("product_tier", ["starter", "pro"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    walletAddress: text("wallet_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    walletIdx: uniqueIndex("users_wallet_idx").on(table.walletAddress)
  })
);

export const licenses = pgTable(
  "licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    licenseKey: text("license_key").notNull(),
    product: productTier("product").notNull(),
    source: text("source").notNull(), // 'stripe' | 'x402'
    sourceReference: text("source_reference"),
    amountCents: integer("amount_cents"),
    currency: text("currency").default("usd"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
  },
  (table) => ({
    keyIdx: uniqueIndex("licenses_key_idx").on(table.licenseKey),
    userIdx: index("licenses_user_idx").on(table.userId)
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    tokenIdx: uniqueIndex("sessions_token_idx").on(table.token),
    userIdx: index("sessions_user_idx").on(table.userId)
  })
);

export const paidRoutes = pgTable(
  "paid_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    route: text("route").notNull(), // 'GET /api/decision'
    priceUsd: text("price_usd").notNull(), // '$0.05' — string for clarity
    network: text("network").default("eip155:8453").notNull(),
    description: text("description"),
    enabled: integer("enabled").default(1).notNull(),
    requestCount: bigint("request_count", { mode: "number" })
      .default(0)
      .notNull(),
    settledCount: bigint("settled_count", { mode: "number" })
      .default(0)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => ({
    routeIdx: uniqueIndex("paid_routes_route_idx").on(table.route)
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type PaidRoute = typeof paidRoutes.$inferSelect;
