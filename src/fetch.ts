import type { FetchResult, Hop } from "./types.js";

export interface FetcherOptions {
  userAgent: string;
  timeoutMs: number;
  fetchImpl?: typeof globalThis.fetch;
}

export interface Fetcher {
  get(url: string, opts?: { redirect?: RequestRedirect; method?: "GET" | "HEAD" }): Promise<FetchResult>;
  /** Follows redirects by hand so every hop (http to https, www to apex, ...) is recorded. */
  chain(url: string, max?: number): Promise<Hop[]>;
}

function errorCode(e: unknown): string {
  const err = e as { cause?: { code?: string }; name?: string; message?: string };
  return String(err?.cause?.code || err?.name || err?.message || "unknown error");
}

export function createFetcher({ userAgent, timeoutMs, fetchImpl = globalThis.fetch }: FetcherOptions): Fetcher {
  async function get(url: string, { redirect = "follow", method = "GET" }: { redirect?: RequestRedirect; method?: "GET" | "HEAD" } = {}): Promise<FetchResult> {
    const t0 = Date.now();
    try {
      const res = await fetchImpl(url, {
        method,
        redirect,
        headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,application/xml,text/plain,*/*" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = method === "HEAD" ? "" : await res.text();
      return { status: res.status, url: res.url || url, headers: res.headers, body, ms: Date.now() - t0 };
    } catch (e) {
      // status 0 means "no answer": callers must treat it as "not checked", never as "missing".
      return { status: 0, url, error: errorCode(e), body: "", ms: Date.now() - t0 };
    }
  }

  async function chain(url: string, max = 6): Promise<Hop[]> {
    const hops: Hop[] = [];
    let cur = url;
    for (let i = 0; i < max; i++) {
      const r = await get(cur, { redirect: "manual" });
      hops.push(r.error ? { url: cur, status: r.status, error: r.error } : { url: cur, status: r.status });
      const loc = r.headers?.get("location");
      if (r.status >= 300 && r.status < 400 && loc) cur = new URL(loc, cur).href;
      else break;
    }
    return hops;
  }

  return { get, chain };
}
