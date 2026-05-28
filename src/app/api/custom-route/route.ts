/**
 * GET /api/custom-route — example monetized endpoint #4 ($0.05 USDC).
 *
 * Pedagogical template. The comments below walk through every config option
 * on `x402Paywall()` so buyers can copy this file, rename the folder, change
 * a few lines, and have their own paid endpoint.
 *
 * Copy-customize checklist:
 *   1. Duplicate this folder under `src/app/api/<your-route>/`.
 *   2. Update `price`, `description`, `resourcePath` in the paywall config.
 *   3. Replace the body of `runHandler()` with your real logic.
 *   4. Add tests in `tests/` (see `smoke-paywall.test.ts` for a template).
 *   5. Insert the route into your `paid_routes` table (see schema.ts).
 */

import { x402Paywall } from "@/middleware/x402-paywall";

// ─── paywall config ──────────────────────────────────────────────────────
//
// `price`         — required. Format "$0.05" (USD string). Converted to
//                   USDC microunits (6 decimals) internally.
//
// `description`   — optional. Shown to clients in the 402 challenge body.
//                   Keep short — buyers / agents read this when deciding
//                   whether to pay.
//
// `resourcePath`  — optional. The canonical URL path advertised in the
//                   challenge. Defaults to the actual request path.
//                   Set explicitly if you proxy / rewrite routes.
//
// `network`       — optional. CAIP-2 chain id. Default Base mainnet
//                   ("eip155:8453"). Set to "eip155:84532" for Base Sepolia.
//
// `asset`         — optional. USDC contract on `network`. Falls back to
//                   env USDC_ASSET_ADDRESS, then to Base mainnet USDC.
//
// `payTo`         — optional. Recipient EVM address. Falls back to env
//                   PAY_TO_ADDRESS. Override here when one endpoint pays a
//                   different wallet than the default.
//
// `maxTimeoutSeconds` — optional. Default 300s. How long the client has to
//                       complete the payment after receiving the challenge.
//
// `facilitatorUrl` / `facilitatorMode` — optional overrides. Defaults come
//                       from env (FACILITATOR_URL / FACILITATOR_MODE).
//
const paywall = x402Paywall({
  price: "$0.05",
  description: "Custom route template — copy + customize this file",
  resourcePath: "/api/custom-route"
  // network: "eip155:8453",
  // payTo: "0xYourCustomReceiverHere",
  // maxTimeoutSeconds: 600,
});

// ─── route handler ───────────────────────────────────────────────────────
//
// Standard Next.js App Router GET handler. Replace `runHandler()` with
// whatever your endpoint actually does — DB query, ML inference, third-
// party API call, signed payload, etc.
//
export async function GET(req: Request): Promise<Response> {
  // 1. Run the paywall first. If `paywall()` returns a Response, it's the
  //    402 challenge — return it directly to the client.
  const challenge = await paywall(req);
  if (challenge) return challenge;

  // 2. Paid + verified. Run your handler.
  return Response.json(runHandler(req));
}

interface CustomResponse {
  message: string;
  paidAt: string;
  echo: Record<string, string>;
}

function runHandler(req: Request): CustomResponse {
  const url = new URL(req.url);
  const echo: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    echo[key] = value;
  });

  return {
    message:
      "You hit a paid endpoint. Replace runHandler() with your real logic.",
    paidAt: new Date().toISOString(),
    echo
  };
}
