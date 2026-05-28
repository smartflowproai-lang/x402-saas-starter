/**
 * Stripe fallback — fiat buyers who can't / won't pay in USDC.
 *
 * Flow:
 *   1. Buyer hits a paid endpoint without an x402 payment, picks Stripe
 *      fallback on the 402 landing page.
 *   2. Backend creates a Stripe Checkout Session (or PaymentIntent).
 *   3. Buyer completes payment, Stripe fires the webhook.
 *   4. Webhook handler verifies signature, mints a license key, writes it
 *      to Postgres, and emails the buyer.
 *
 * This module exposes the webhook handler. The Checkout Session creator
 * lives in `/src/app/api/stripe/checkout/route.ts` (TODO Wave 2).
 *
 * NOTE: the Stripe SDK call is intentionally stubbed — we ship the wiring
 *       and let buyers slot their own STRIPE_SECRET_KEY in. License delivery
 *       (email) is also stubbed with a TODO so we don't ship a half-baked
 *       email transport.
 */

import Stripe from "stripe";

export interface StripeFallbackEnv {
  secretKey: string;
  webhookSecret: string;
  priceIdStarter: string;
}

export interface LicensePayload {
  email: string;
  product: "starter" | "pro";
  stripeSessionId: string;
  amountCents: number;
  currency: string;
  issuedAt: string;
}

/**
 * Load Stripe env safely. Throws a clear error if the buyer forgot to set
 * the secret key — better than a cryptic Stripe 401.
 */
export function loadStripeEnv(): StripeFallbackEnv {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const priceIdStarter = process.env.STRIPE_PRICE_ID_STARTER;

  if (!secretKey || secretKey.startsWith("sk_test_replace_me")) {
    throw new Error(
      "Stripe fallback misconfigured: set STRIPE_SECRET_KEY in your .env"
    );
  }
  if (!webhookSecret) {
    throw new Error(
      "Stripe fallback misconfigured: set STRIPE_WEBHOOK_SECRET in your .env"
    );
  }
  if (!priceIdStarter) {
    throw new Error(
      "Stripe fallback misconfigured: set STRIPE_PRICE_ID_STARTER in your .env"
    );
  }

  return { secretKey, webhookSecret, priceIdStarter };
}

let _stripe: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (_stripe) return _stripe;
  const env = loadStripeEnv();
  _stripe = new Stripe(env.secretKey, { apiVersion: "2024-06-20" });
  return _stripe;
}

/**
 * Webhook handler. Returns a Response suitable for direct return from a
 * Next.js Route Handler.
 *
 * Caller should:
 *   - read raw body (request.text())
 *   - pull the `stripe-signature` header
 *   - pass both to handleStripeWebhook
 */
export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null
): Promise<Response> {
  if (!signature) {
    return new Response(JSON.stringify({ error: "missing stripe-signature" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }

  const env = loadStripeEnv();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.webhookSecret
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: `webhook signature verification failed: ${message}` }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const license: LicensePayload = {
      email: session.customer_email ?? session.customer_details?.email ?? "",
      product: detectProduct(session),
      stripeSessionId: session.id,
      amountCents: session.amount_total ?? 0,
      currency: session.currency ?? "usd",
      issuedAt: new Date().toISOString()
    };

    // TODO Wave 2:
    //   1. Mint license key (HMAC-SHA256(LICENSE_SIGNING_SECRET, email + sessionId))
    //   2. Insert into `licenses` table via Drizzle
    //   3. Email license + download link to license.email
    //
    // For now we log so buyers can wire in their preferred transport.
    console.log("[stripe-fallback] license issued (stub):", license);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function detectProduct(session: Stripe.Checkout.Session): "starter" | "pro" {
  // Tier detection — buyers should override to fit their own price IDs.
  const meta = (session.metadata ?? {}) as Record<string, string | undefined>;
  if (meta.product === "pro") return "pro";
  return "starter";
}
