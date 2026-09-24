/** A fake fetch serving an in-memory site, so tests never touch the network. */
export interface Route {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

export function fakeFetch(routes: Record<string, Route | string>): typeof globalThis.fetch {
  const fetchOne = async (input: string | URL | Request, init?: RequestInit, hops = 0): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    if (route === undefined) {
      // Unknown hosts behave like a DNS failure, unknown paths like a 404.
      const known = Object.keys(routes).some((k) => new URL(k).origin === new URL(url).origin);
      if (!known) throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
      return new Response("<html><body>Not found</body></html>", { status: 404, headers: { "content-type": "text/html" } });
    }
    const r: Route = typeof route === "string" ? { body: route } : route;
    const status = r.status ?? 200;
    const isRedirect = status >= 300 && status < 400;
    const location = r.headers?.location;
    // Like real fetch: follow redirects unless asked not to, and expose the final URL.
    if (isRedirect && location && init?.redirect !== "manual" && hops < 10) {
      const res = await fetchOne(new URL(location, url).href, init, hops + 1);
      if (!res.url) Object.defineProperty(res, "url", { value: new URL(location, url).href });
      return res;
    }
    const type = url.endsWith(".xml") ? "application/xml" : url.endsWith(".txt") ? "text/plain" : "text/html";
    return new Response(isRedirect ? null : (r.body ?? ""), { status, headers: { "content-type": type, ...r.headers } });
  };
  return ((input: string | URL | Request, init?: RequestInit) => fetchOne(input, init)) as typeof globalThis.fetch;
}

export function page({
  title = "Bakery in Riverside | Example Bakery",
  description = "We bake sourdough bread, focaccia and pastries every morning in Riverside, with flour from local mills and long, slow rising times.",
  canonical = "https://example.com/",
  h1 = "Bread baked every morning",
  body = "",
  head = "",
}: Partial<Record<"title" | "description" | "canonical" | "h1" | "body" | "head", string | null>> = {}): string {
  const filler = "Every loaf starts the evening before, with a starter we feed twice a day and dough that rests overnight in the cold. ".repeat(4);
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${title !== null ? `<title>${title}</title>` : ""}
${description !== null ? `<meta name="description" content="${description}">` : ""}
${canonical !== null ? `<link rel="canonical" href="${canonical}">` : ""}
<meta property="og:image" content="https://example.com/og.jpg">
${head}
</head><body><main>
${h1 !== null ? `<h1>${h1}</h1>` : ""}
<p>${filler}</p>
${body}
<a href="tel:+390123456789">Call us</a>
</main></body></html>`;
}
