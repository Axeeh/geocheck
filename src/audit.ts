import { createFetcher } from "./fetch.js";
import { parsePage } from "./html.js";
import { parseRobots, unknownBots } from "./robots.js";
import { readSitemaps } from "./sitemap.js";
import {
  checkHome, checkPage, checkPageSpeed, checkRedirects, checkRobots, checkSitemap, checkSiteWide, sortIssues, summarize,
} from "./checks.js";
import { computeScore } from "./score.js";
import type { AuditOptions, AuditResult, Issue, PageResult, PageSpeed, SiteData } from "./types.js";

export const DEFAULT_USER_AGENT = "Mozilla/5.0 (compatible; geocheck; +https://github.com/Axeeh/geocheck)";

/** Thrown when the home page gives no answer at all: nothing was checked, so nothing can be concluded. */
export class UnreachableError extends Error {
  constructor(readonly url: string, readonly reason: string) {
    super(`${url} did not answer (${reason}). Nothing was checked. Before concluding the site is down, check DNS and try from another network.`);
    this.name = "UnreachableError";
  }
}

export const isLocalHost = (hostname: string): boolean =>
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(hostname) || hostname.endsWith(".local");

/** "/index.html" and "/" are the same page. */
const pageKey = (u: string): string => u.replace(/index\.html?$/i, "").replace(/\/$/, "");

export async function runAudit(options: AuditOptions): Promise<AuditResult> {
  const requested = new URL(options.url);
  const isLocal = isLocalHost(requested.hostname);
  const maxPages = options.maxPages ?? 30;
  const maxCheck = options.maxCheck ?? 200;
  const progress = options.onProgress ?? (() => {});
  const http = createFetcher({
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    timeoutMs: options.timeoutMs ?? 15000,
    fetchImpl: options.fetch,
  });
  const issues: Issue[] = [];

  // Home
  progress("home page");
  const home = await http.get(requested.href);
  if (home.status === 0) throw new UnreachableError(requested.href, home.error ?? "no answer");

  // If the home redirects to another host (apex to www, http to https), that is where
  // the site lives: audit the final origin, or its own canonical and sitemap look "foreign".
  const landed = new URL(home.url || requested.href);
  const rebased = !isLocal && landed.origin !== requested.origin;
  const start = rebased ? landed : requested;
  const origin = start.origin;
  issues.push(...checkHome(home.status, start.href));

  // Redirects: http to https, www to apex. Only meaningful on a real domain.
  let redirects: SiteData["redirects"];
  if (!isLocal) {
    progress("redirects");
    const host = start.hostname;
    const altHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    redirects = { http: await http.chain(`http://${host}/`), alt: await http.chain(`https://${altHost}/`), altHost };
    const altLast = redirects.alt.at(-1);
    if (altLast?.status === 0) redirects.note = `${altHost} does not answer (${altLast.error}): fine if it was never advertised`;
    issues.push(...checkRedirects(redirects, host));
  }

  // robots.txt
  progress("robots.txt");
  const robotsRes = await http.get(`${origin}/robots.txt`);
  const robotsReadable = robotsRes.status === 200 && !/<html/i.test(robotsRes.body.slice(0, 500));
  const robotsParsed = parseRobots(robotsReadable ? robotsRes.body : "");
  const robots: SiteData["robots"] = { status: robotsReadable ? 200 : robotsRes.status === 200 ? 404 : robotsRes.status, sitemaps: robotsParsed.sitemaps };
  if (robotsReadable) robots.raw = robotsRes.body.slice(0, 3000);
  if (robotsRes.status === 0) robots.note = `robots.txt not read (${robotsRes.error}): crawler rules are unknown, not absent`;
  const bots = robotsRes.status === 0 ? unknownBots() : robotsParsed.bots;
  issues.push(...checkRobots(robots, bots, origin));

  // llms.txt
  const llms = await http.get(`${origin}/llms.txt`);
  const llmsTxt = { status: llms.status, present: llms.status === 200 && !/<html/i.test(llms.body.slice(0, 300)) };

  // Sitemap. Locally, robots.txt points to the real domain: read the local copy instead.
  progress("sitemap");
  const toLocal = (u: string) => {
    try {
      return origin + new URL(u).pathname;
    } catch {
      return u;
    }
  };
  let candidates = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap-index.xml`, `${origin}/sitemap_index.xml`];
  if (isLocal) candidates = candidates.map(toLocal);
  const sm = await readSitemaps(http, candidates);
  const smUrls = isLocal ? sm.urls.map(toLocal) : sm.urls;

  const sitemapStatus: SiteData["sitemapStatus"] = [];
  const toCheck = smUrls.slice(0, maxCheck);
  for (let i = 0; i < toCheck.length; i += 8) {
    progress(`sitemap URLs ${i + 1}-${Math.min(i + 8, toCheck.length)} of ${toCheck.length}`);
    sitemapStatus.push(...(await Promise.all(toCheck.slice(i, i + 8).map(async (url) => {
      const r = await http.get(url, { redirect: "manual", method: "HEAD" });
      const r2 = r.status === 405 || r.status === 0 ? await http.get(url, { redirect: "manual" }) : r;
      return { url, status: r2.status, location: r2.headers?.get("location") ?? null };
    }))));
  }
  issues.push(...checkSitemap({ count: sm.urls.length, candidates, urls: sm.urls }, sitemapStatus, { origin, isLocal }));

  // Pages: same-origin sitemap URLs, otherwise crawl from the home page links.
  let pageUrls = isLocal ? smUrls : smUrls.filter((u) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  });
  const crawled = !pageUrls.length;
  pageUrls = [start.href, ...pageUrls.filter((u) => pageKey(u) !== pageKey(start.href))];

  const pages: PageResult[] = [];
  const seen = new Set<string>();
  const queue = [...pageUrls];
  while (queue.length && pages.length < maxPages) {
    const u = queue.shift()!;
    const key = pageKey(u);
    if (seen.has(key)) continue;
    seen.add(key);
    progress(`page ${pages.length + 1}: ${u}`);
    const r = u === start.href ? home : await http.get(u);
    // A URL that redirects to a page already audited (a sitemap URL that moved) is not a new page.
    const finalKey = pageKey(r.url);
    if (finalKey !== key) {
      if (seen.has(finalKey)) continue;
      seen.add(finalKey);
    }
    const type = r.headers?.get("content-type") ?? "text/html";
    if (r.status !== 200 || !/html/i.test(type)) {
      pages.push(r.error ? { ok: false, url: u, status: r.status, error: r.error } : { ok: false, url: u, status: r.status });
      continue;
    }
    if (new URL(r.url).origin !== origin && !isLocal) {
      pages.push({ ok: false, url: u, status: r.status, error: `redirects off-site to ${r.url}` });
      continue;
    }
    const p = parsePage(r.url, r.body, { origin, phonePrefix: options.phonePrefix });
    const url = u === start.href ? u : r.url;
    pages.push({ ok: true, url, finalUrl: r.url, status: r.status, ms: r.ms, kb: Math.round(r.body.length / 1024), xRobots: r.headers?.get("x-robots-tag") ?? null, ...p });
    if (crawled) for (const l of p.internal) if (!seen.has(pageKey(l))) queue.push(l);
  }

  const ok = pages.filter((p): p is Extract<PageResult, { ok: true }> => p.ok);
  for (const p of ok) issues.push(...checkPage(p, { origin, isLocal, crawled }));
  const { nap, geo } = summarize(ok, options.phonePrefix);
  issues.push(...checkSiteWide(ok, { nap, geo, llmsTxt }, origin));

  // PageSpeed Insights (optional, public sites only)
  let pageSpeed: PageSpeed | undefined;
  if (options.pageSpeed && !isLocal) {
    progress("PageSpeed Insights");
    pageSpeed = await runPageSpeed(http, start.href, options.pageSpeedKey);
    issues.push(...checkPageSpeed(pageSpeed));
  }

  const site: SiteData = {
    start: start.href,
    ...(rebased ? { redirectedFrom: requested.href } : {}),
    isLocal,
    date: new Date().toISOString().slice(0, 10),
    home: home.error
      ? { status: home.status, finalUrl: home.url, ms: home.ms, kb: Math.round(home.body.length / 1024), error: home.error }
      : { status: home.status, finalUrl: home.url, ms: home.ms, kb: Math.round(home.body.length / 1024) },
    ...(redirects ? { redirects } : {}),
    robots,
    bots,
    llmsTxt,
    sitemap: { read: sm.read, count: sm.urls.length, crawled },
    sitemapStatus,
    nap,
    geo,
    ...(pageSpeed ? { pageSpeed } : {}),
  };
  const sorted = sortIssues(issues);
  return { site, pages, issues: sorted, score: computeScore(sorted, ok.length) };
}

async function runPageSpeed(http: ReturnType<typeof createFetcher>, url: string, key?: string): Promise<PageSpeed> {
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=" + encodeURIComponent(url) +
    "&strategy=mobile&category=performance&category=seo&category=accessibility" + (key ? `&key=${encodeURIComponent(key)}` : "");
  const r = await http.get(api);
  try {
    const j = JSON.parse(r.body);
    const c = j.lighthouseResult.categories;
    const a = j.lighthouseResult.audits;
    return {
      performance: Math.round(c.performance.score * 100),
      seo: Math.round(c.seo.score * 100),
      accessibility: Math.round(c.accessibility.score * 100),
      lcp: a["largest-contentful-paint"]?.displayValue,
      cls: a["cumulative-layout-shift"]?.displayValue,
      tbt: a["total-blocking-time"]?.displayValue,
    };
  } catch {
    // 429 without a key is common: "not measured", never a bad score.
    return { error: `PageSpeed not available (status ${r.status}${r.error ? ", " + r.error : ""})` };
  }
}
