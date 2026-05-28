/**
 * GET /api/decision — example monetized endpoint #1 ($0.05 USDC).
 *
 * Returns a BUY / WATCH / AVOID recommendation for a token symbol passed as
 * `?symbol=<TICKER>`. Mock data — wire your own model / signal source in the
 * `runDecision()` function below.
 *
 * Flow:
 *   1. Route handler calls the paywall.
 *   2. No X-Payment header → 402 challenge returned to client.
 *   3. Valid X-Payment header → verify against facilitator, then settle in
 *      background. The handler proceeds to runDecision().
 */

import { x402Paywall } from "@/middleware/x402-paywall";

const paywall = x402Paywall({
  price: "$0.05",
  description: "Decision API — token BUY / WATCH / AVOID recommendation",
  resourcePath: "/api/decision"
});

interface DecisionResponse {
  symbol: string;
  recommendation: "BUY" | "WATCH" | "AVOID";
  score: number;
  reasoning: string;
  generatedAt: string;
}

export async function GET(req: Request): Promise<Response> {
  const challenge = await paywall(req);
  if (challenge) return challenge;

  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "SOL").toUpperCase();

  return Response.json(runDecision(symbol));
}

/**
 * Mock decision logic. Replace with your own signal model — e.g. on-chain
 * activity, social momentum, dev velocity, whale flow.
 */
function runDecision(symbol: string): DecisionResponse {
  // Deterministic mock so the same symbol always returns the same call —
  // useful for smoke tests, easy to demo. Replace freely.
  const seed = symbol
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const score = (seed * 13) % 101; // 0-100

  let recommendation: DecisionResponse["recommendation"];
  let reasoning: string;
  if (score >= 70) {
    recommendation = "BUY";
    reasoning = `${symbol} momentum + on-chain accumulation strong (score ${score}).`;
  } else if (score >= 40) {
    recommendation = "WATCH";
    reasoning = `${symbol} mixed signals — wait for confirmation (score ${score}).`;
  } else {
    recommendation = "AVOID";
    reasoning = `${symbol} distribution + weak depth, sit it out (score ${score}).`;
  }

  return {
    symbol,
    recommendation,
    score,
    reasoning,
    generatedAt: new Date().toISOString()
  };
}
