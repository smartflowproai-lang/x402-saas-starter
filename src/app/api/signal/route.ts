/**
 * GET /api/signal — example monetized endpoint #3 ($0.02 USDC).
 *
 * Demonstrates micro-pricing — sub-cent fee for a small structured feed.
 * Returns a list of mock token signals (symbol + signal type + confidence).
 *
 * Replace `runSignalFeed()` with your real model output. Keep the response
 * compact — micro-priced endpoints are usually polled at high frequency,
 * payload size matters.
 */

import { x402Paywall } from "@/middleware/x402-paywall";

const paywall = x402Paywall({
  price: "$0.02",
  description: "Signal feed — top token signals snapshot",
  resourcePath: "/api/signal"
});

type SignalType = "accumulation" | "distribution" | "breakout" | "consolidation";

interface Signal {
  symbol: string;
  signal: SignalType;
  confidence: number; // 0-100
  windowMinutes: number;
}

interface SignalResponse {
  generatedAt: string;
  windowMinutes: number;
  signals: Signal[];
}

export async function GET(req: Request): Promise<Response> {
  const challenge = await paywall(req);
  if (challenge) return challenge;

  return Response.json(runSignalFeed());
}

function runSignalFeed(): SignalResponse {
  // Mock snapshot. Deterministic-ish so smoke tests have stable assertions.
  const windowMinutes = 15;
  const signals: Signal[] = [
    {
      symbol: "SOL",
      signal: "accumulation",
      confidence: 78,
      windowMinutes
    },
    {
      symbol: "JTO",
      signal: "breakout",
      confidence: 64,
      windowMinutes
    },
    {
      symbol: "BONK",
      signal: "distribution",
      confidence: 55,
      windowMinutes
    },
    {
      symbol: "WIF",
      signal: "consolidation",
      confidence: 49,
      windowMinutes
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    windowMinutes,
    signals
  };
}
