/**
 * x402 paywall middleware — Next.js App Router edition.
 *
 * Port of the production-tested CDP v2 + EIP-3009 USDC verify/settle flow
 * (originally /home/ubuntu/x402-api/custom-x402-middleware.cjs, ~82 LOC).
 *
 * Two execution modes:
 *
 *   1. CDP facilitator   — verify + settle via Coinbase Developer Platform
 *      (FACILITATOR_MODE=cdp). Requires CDP_API_KEY_ID / CDP_API_KEY_SECRET.
 *
 *   2. Own facilitator   — point FACILITATOR_URL at xpay.sh or any
 *      x402-spec-compliant facilitator. No CDP auth headers required.
 *
 * Usage from a Next.js Route Handler:
 *
 *   import { x402Paywall } from "@/middleware/x402-paywall";
 *
 *   const paywall = x402Paywall({
 *     price: "$0.05",
 *     description: "Decision API — token BUY/WATCH/AVOID rec",
 *     resourcePath: "/api/decision"
 *   });
 *
 *   export async function GET(req: Request) {
 *     const challenge = await paywall(req);
 *     if (challenge) return challenge;          // 402 returned to client
 *     return Response.json({ recommendation: "..." });
 *   }
 *
 * The challenge response shape matches x402 v2 spec
 * (https://x402.org / coinbase x402 docs).
 */

export interface X402AcceptedConfig {
  /** Price as a "$0.05" string. Converted to USDC microunits (6 decimals). */
  price: string;
  /** Network in CAIP-2 format. Defaults to Base mainnet. */
  network?: string;
  /** USDC contract address on the target network. */
  asset?: string;
  /** Recipient wallet address (EVM). Falls back to env PAY_TO_ADDRESS. */
  payTo?: string;
  /** EIP-3009 token metadata. Defaults to USDC. */
  extra?: { name: string; version: string };
}

export interface X402PaywallOptions extends X402AcceptedConfig {
  /** Free-text description shown to clients in the 402 challenge. */
  description?: string;
  /** Override the resource URL advertised in the 402 challenge. */
  resourcePath?: string;
  /** Max payment timeout in seconds. Defaults to 300. */
  maxTimeoutSeconds?: number;
  /** Override the facilitator URL. Defaults to env FACILITATOR_URL. */
  facilitatorUrl?: string;
  /** Override the facilitator mode. Defaults to env FACILITATOR_MODE. */
  facilitatorMode?: "cdp" | "own" | "xpay";
}

export interface X402AcceptedRequirement {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string };
}

export interface X402PaymentRequirements {
  x402Version: 2;
  error: string;
  resource: { url: string; description: string; mimeType: string };
  accepts: X402AcceptedRequirement[];
}

interface CdpAuthHeaders {
  verify: Record<string, string>;
  settle: Record<string, string>;
}

/**
 * Build the on-chain accepted requirement object that the spec returns
 * inside the PAYMENT-REQUIRED header and the JSON body.
 */
function buildAccepted(
  opts: X402AcceptedConfig,
  defaultPayTo: string
): X402AcceptedRequirement {
  const usdAmount = parseFloat(opts.price.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    throw new Error(`x402-paywall: invalid price "${opts.price}"`);
  }
  // USDC has 6 decimals — $0.05 -> 50000 microunits.
  const microUnits = String(Math.round(usdAmount * 1_000_000));

  return {
    scheme: "exact",
    network: opts.network ?? "eip155:8453",
    amount: microUnits,
    asset:
      opts.asset ??
      process.env.USDC_ASSET_ADDRESS ??
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: opts.payTo ?? defaultPayTo,
    maxTimeoutSeconds: 300,
    extra: opts.extra ?? { name: "USD Coin", version: "2" }
  };
}

/**
 * Create a CDP-style auth header pair for a verify + settle pair of calls.
 *
 * TODO: when FACILITATOR_MODE=cdp, this MUST be replaced with the official
 *       CDP SDK signer (HMAC-SHA256 over canonical request). Stub below
 *       passes raw env credentials to the facilitator for development; the
 *       hosted CDP facilitator will reject unsigned calls in production.
 *       See: docs/cdp-integration.md (TODO Wave 1).
 */
async function createCdpAuthHeaders(
  _method: string,
  _path: string
): Promise<CdpAuthHeaders> {
  const apiKeyId = process.env.CDP_API_KEY_ID ?? "";
  const apiKeySecret = process.env.CDP_API_KEY_SECRET ?? "";

  const common: Record<string, string> = {
    "X-CDP-API-Key": apiKeyId,
    "X-CDP-API-Secret": apiKeySecret
  };

  return { verify: common, settle: common };
}

/**
 * Encode a JSON object as base64 for the PAYMENT-REQUIRED HTTP header.
 */
function encodeChallenge(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Build the 402 challenge Response (Next.js Web Response).
 */
function buildChallenge(
  requirements: X402PaymentRequirements
): Response {
  return new Response("{}", {
    status: 402,
    headers: {
      "content-type": "application/json",
      "payment-required": encodeChallenge(requirements)
    }
  });
}

/**
 * Public factory. Returns an async function you can call from a Route
 * Handler. If the request lacks a valid `X-Payment` header, the function
 * returns a Response (the 402 challenge) which the caller should return
 * straight back to the client. If the request is paid + verified, the
 * function returns `null` and the caller proceeds with their handler.
 */
export function x402Paywall(opts: X402PaywallOptions) {
  const facilitatorUrl =
    opts.facilitatorUrl ??
    process.env.FACILITATOR_URL ??
    "https://api.cdp.coinbase.com";
  const facilitatorMode =
    opts.facilitatorMode ??
    (process.env.FACILITATOR_MODE as "cdp" | "own" | "xpay" | undefined) ??
    "cdp";
  const defaultPayTo = process.env.PAY_TO_ADDRESS ?? "";

  return async function paywall(req: Request): Promise<Response | null> {
    if (!defaultPayTo && !opts.payTo) {
      return new Response(
        JSON.stringify({
          error:
            "x402-paywall misconfigured: no payTo address set (PAY_TO_ADDRESS env or payTo option)"
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const accepted = buildAccepted(opts, defaultPayTo);
    const url = new URL(req.url);
    const resourceUrl =
      opts.resourcePath !== undefined
        ? `${url.origin}${opts.resourcePath}`
        : `${url.origin}${url.pathname}`;

    const paymentHeader =
      req.headers.get("x-payment") ?? req.headers.get("payment");

    if (!paymentHeader) {
      const requirements: X402PaymentRequirements = {
        x402Version: 2,
        error: "Payment required",
        resource: {
          url: resourceUrl,
          description: opts.description ?? "",
          mimeType: ""
        },
        accepts: [accepted]
      };
      return buildChallenge(requirements);
    }

    let paymentPayload: Record<string, unknown>;
    try {
      paymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf8")
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "invalid X-Payment header (not base64 JSON)" }),
        { status: 402, headers: { "content-type": "application/json" } }
      );
    }
    paymentPayload.accepted = accepted;

    try {
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };

      if (facilitatorMode === "cdp") {
        const authHeaders = await createCdpAuthHeaders(
          "POST",
          "/platform/v2/x402/verify"
        );
        Object.assign(headers, authHeaders.verify);
      }

      const verifyRes = await fetch(`${facilitatorUrl}/verify`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          x402Version: 2,
          paymentPayload,
          paymentRequirements: accepted
        })
      });

      const verifyData = (await verifyRes.json()) as {
        isValid?: boolean;
        invalidReason?: string;
      };

      if (verifyRes.ok && verifyData.isValid) {
        // Settle in the background — we already 200 to the client even if
        // settle fails (matches production behaviour: settle errors are
        // logged but non-fatal — facilitator retries).
        void settleInBackground(
          facilitatorUrl,
          facilitatorMode,
          paymentPayload,
          accepted
        );
        return null;
      }

      const requirements: X402PaymentRequirements = {
        x402Version: 2,
        error: verifyData.invalidReason ?? "Payment verification failed",
        resource: {
          url: resourceUrl,
          description: opts.description ?? "",
          mimeType: ""
        },
        accepts: [accepted]
      };
      return buildChallenge(requirements);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: message }), {
        status: 402,
        headers: { "content-type": "application/json" }
      });
    }
  };
}

async function settleInBackground(
  facilitatorUrl: string,
  facilitatorMode: "cdp" | "own" | "xpay",
  paymentPayload: Record<string, unknown>,
  accepted: X402AcceptedRequirement
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (facilitatorMode === "cdp") {
      const authHeaders = await createCdpAuthHeaders(
        "POST",
        "/platform/v2/x402/settle"
      );
      Object.assign(headers, authHeaders.settle);
    }
    await fetch(`${facilitatorUrl}/settle`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload,
        paymentRequirements: accepted
      })
    });
  } catch {
    // Non-fatal — production middleware also swallows settle errors and
    // relies on facilitator retries.
  }
}
