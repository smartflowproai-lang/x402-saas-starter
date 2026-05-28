/**
 * Landing demo page — server component. Lists the four example endpoints
 * with their prices and a "try" link that hits the route directly. Buyers
 * see the 402 challenge in their browser, which is the cleanest way to
 * demo the paywall without a wallet connection.
 *
 * Tailwind classes assume the buyer wires Tailwind during setup. If not,
 * styles degrade gracefully — semantic HTML still reads fine.
 */

interface EndpointCard {
  route: string;
  price: string;
  description: string;
  exampleHref: string;
}

const ENDPOINTS: EndpointCard[] = [
  {
    route: "GET /api/decision",
    price: "$0.05",
    description: "Token BUY / WATCH / AVOID recommendation",
    exampleHref: "/api/decision?symbol=SOL"
  },
  {
    route: "GET /api/scraping",
    price: "$0.10",
    description: "Fetch + parse a public URL",
    exampleHref: "/api/scraping?url=https://example.com"
  },
  {
    route: "GET /api/signal",
    price: "$0.02",
    description: "Top token signals snapshot",
    exampleHref: "/api/signal"
  },
  {
    route: "GET /api/custom-route",
    price: "$0.05",
    description: "Copy + customize template",
    exampleHref: "/api/custom-route?demo=true"
  }
];

export default function HomePage(): JSX.Element {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">
          x402 SaaS Starter
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          production-tested middleware. ship a paid API in under 60 minutes.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-medium">example endpoints</h2>
        <p className="mb-6 text-sm text-neutral-500">
          each route is wrapped with the x402 paywall middleware. hit any of
          them in your browser to see the live 402 challenge response — the
          same response an agent or wallet would receive.
        </p>

        <ul className="space-y-4">
          {ENDPOINTS.map((endpoint) => (
            <li
              key={endpoint.route}
              className="rounded-lg border border-neutral-200 p-4"
            >
              <div className="flex items-baseline justify-between">
                <code className="text-sm font-mono text-neutral-900">
                  {endpoint.route}
                </code>
                <span className="text-sm font-semibold text-neutral-700">
                  {endpoint.price}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">
                {endpoint.description}
              </p>
              <a
                href={endpoint.exampleHref}
                className="mt-3 inline-block text-sm text-blue-600 hover:underline"
              >
                try with wallet →
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 text-xl font-medium">try with wallet</h2>
        <p className="text-sm text-neutral-600">
          install{" "}
          <a
            className="text-blue-600 hover:underline"
            href="https://phantom.com"
          >
            Phantom
          </a>{" "}
          (or any x402-compatible wallet), fund it with a little USDC on Base,
          and call any endpoint above. the wallet handles the 402 challenge,
          signs the payment, and resubmits the request automatically.
        </p>
      </section>

      <footer className="border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        built by{" "}
        <a
          className="text-blue-600 hover:underline"
          href="https://twitter.com/tomsmart_ai"
        >
          @tomsmart_ai
        </a>{" "}
        · MIT core, commercial extended ·{" "}
        <a
          className="text-blue-600 hover:underline"
          href="https://github.com/smartflowproai-lang/x402-saas-starter"
        >
          github
        </a>
      </footer>
    </main>
  );
}
