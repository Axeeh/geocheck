import { decode } from "./html.js";
import type { Fetcher } from "./fetch.js";
import type { Hop } from "./types.js";

export function extractLocs(xml: string): { isIndex: boolean; locs: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
  return { isIndex: /<sitemapindex/i.test(xml), locs };
}

/** Reads sitemaps and nested sitemap indexes (at most 25 files). */
export async function readSitemaps(http: Fetcher, candidates: string[]): Promise<{ read: Hop[]; urls: string[] }> {
  const urls = new Set<string>();
  const read: Hop[] = [];
  const queue = [...candidates];
  const seen = new Set<string>();
  while (queue.length && seen.size < 25) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await http.get(sm);
    read.push(r.error ? { url: sm, status: r.status, error: r.error } : { url: sm, status: r.status });
    if (r.status !== 200) continue;
    const { isIndex, locs } = extractLocs(r.body);
    if (isIndex) queue.push(...locs);
    else locs.forEach((l) => urls.add(l));
  }
  return { read, urls: [...urls] };
}
