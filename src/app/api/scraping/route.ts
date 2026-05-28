/**
 * GET /api/scraping?url=<target> — example monetized endpoint #2 ($0.10 USDC).
 *
 * Demonstrates higher-tier pricing + query param input. Returns a mock scrape
 * result (title + meta description + status + extracted text length).
 *
 * Wire your own scraping engine (crawl4ai, puppeteer, jina reader, etc.) in
 * `runScrape()` below. The mock keeps the response shape stable for tests.
 */

import { x402Paywall } from "@/middleware/x402-paywall";

const paywall = x402Paywall({
  price: "$0.10",
  description: "Scraping API — fetch and parse a public URL",
  resourcePath: "/api/scraping"
});

interface ScrapeResponse {
  requestedUrl: string;
  status: "ok" | "error";
  title: string;
  metaDescription: string;
  textLength: number;
  fetchedAt: string;
}

export async function GET(req: Request): Promise<Response> {
  const challenge = await paywall(req);
  if (challenge) return challenge;

  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return Response.json(
      { error: "Missing required query param: url" },
      { status: 400 }
    );
  }

  return Response.json(runScrape(target));
}

/**
 * Mock scrape. Returns deterministic shape so the smoke test can assert
 * fields. Replace with a real fetcher when you wire your stack in.
 */
function runScrape(target: string): ScrapeResponse {
  let hostname = target;
  try {
    hostname = new URL(target).hostname;
  } catch {
    return {
      requestedUrl: target,
      status: "error",
      title: "",
      metaDescription: "Invalid URL",
      textLength: 0,
      fetchedAt: new Date().toISOString()
    };
  }

  return {
    requestedUrl: target,
    status: "ok",
    title: `${hostname} — homepage`,
    metaDescription: `Mock meta description for ${hostname}. Replace runScrape() with your real scraper.`,
    textLength: 4200,
    fetchedAt: new Date().toISOString()
  };
}
