/**
 * Every check is a pure function from measured data to issues. Each issue is a
 * measurement, not an opinion: the message says what was seen and where.
 * Rule ids are documented in docs/checks.md.
 */
import { CLASSIC_SEARCH } from "./robots.js";
import { normPhone } from "./html.js";
import type { BotVerdict, Category, Hop, Issue, PageResult, PageSpeed, Scope, Severity, SiteData } from "./types.js";

type OkPage = Extract<PageResult, { ok: true }>;

const issue = (id: string, severity: Severity, category: Category, scope: Scope, message: string, where?: string): Issue =>
  where === undefined ? { id, severity, category, scope, message } : { id, severity, category, scope, message, where };

export const pathOf = (u: string): string => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

export function checkHome(status: number, url: string): Issue[] {
  return status === 200 ? [] : [issue("home-status", "high", "crawl", "site", `Home page does not return 200 (status ${status})`, url)];
}

export function checkRedirects(r: { http: Hop[]; alt: Hop[]; altHost: string }, host: string): Issue[] {
  const out: Issue[] = [];
  if (!r.http.some((h) => h.url.startsWith("https://"))) {
    out.push(issue("http-not-https", "high", "crawl", "site", "http:// does not redirect to https://", `http://${host}/`));
  }
  if (r.http.length > 3) {
    out.push(issue("redirect-chain", "low", "crawl", "site", `Chain of ${r.http.length - 1} redirects from http`, `http://${host}/`));
  }
  const last = r.alt.at(-1);
  if (r.alt.length === 1 && last?.status === 200) {
    out.push(issue("duplicate-host", "medium", "crawl", "site", `${r.altHost} answers 200 without redirecting: two copies of the same site`, `https://${r.altHost}/`));
  }
  return out;
}

export function checkRobots(robots: SiteData["robots"], bots: BotVerdict[], origin: string): Issue[] {
  const out: Issue[] = [];
  const where = `${origin}/robots.txt`;
  if (robots.status === 200) {
    if (!robots.sitemaps.length) out.push(issue("robots-no-sitemap", "low", "crawl", "site", "robots.txt does not point to a sitemap (no Sitemap: line)", where));
  } else if (robots.status !== 0) {
    out.push(issue("robots-missing", "medium", "crawl", "site", `robots.txt not found (status ${robots.status})`, where));
  }
  for (const b of bots) {
    if (b.status !== "blocked" || b.kind !== "search") continue;
    if (CLASSIC_SEARCH.has(b.name)) {
      out.push(issue("search-bot-blocked", "high", "crawl", "site", `${b.name} is blocked in robots.txt: the site cannot appear in that search engine`, where));
    } else {
      out.push(issue(`ai-bot-blocked:${b.name}`, "high", "ai", "site", `${b.name} is blocked in robots.txt: the site cannot be fetched to answer questions in that engine`, where));
    }
  }
  return out;
}

export function checkSitemap(
  sitemap: { count: number; candidates: string[]; urls: string[] },
  status: SiteData["sitemapStatus"],
  { origin, isLocal }: { origin: string; isLocal: boolean },
): Issue[] {
  const out: Issue[] = [];
  if (!sitemap.count) out.push(issue("sitemap-missing", "medium", "crawl", "site", "No readable sitemap", sitemap.candidates.join(", ")));
  const foreign = sitemap.urls.filter((u) => {
    try {
      return new URL(u).origin !== origin;
    } catch {
      return true;
    }
  });
  if (foreign.length && !isLocal) {
    out.push(issue("sitemap-foreign-urls", "high", "crawl", "site", `${foreign.length} sitemap URLs point to another host or protocol (e.g. ${foreign[0]})`, "sitemap"));
  }
  const redirects = status.filter((r) => r.status >= 300 && r.status < 400);
  const errors = status.filter((r) => r.status !== 200 && !(r.status >= 300 && r.status < 400));
  if (redirects.length) {
    out.push(issue("sitemap-url-redirect", "medium", "crawl", "site",
      `${redirects.length} sitemap URLs redirect (e.g. ${redirects[0].url} → ${redirects[0].location ?? "?"}): list the final URL instead`, "sitemap"));
  }
  if (errors.length) {
    out.push(issue("sitemap-url-error", "high", "crawl", "site",
      `${errors.length} sitemap URLs do not answer 200 (e.g. ${errors[0].url}: ${errors[0].status || "no answer"})`, "sitemap"));
  }
  return out;
}

export function checkPage(p: OkPage, { origin, isLocal, crawled }: { origin: string; isLocal: boolean; crawled: boolean }): Issue[] {
  const out: Issue[] = [];
  const w = pathOf(p.url);
  const add = (id: string, severity: Severity, category: Category, message: string) => out.push(issue(id, severity, category, "page", message, w));

  const noindex = /noindex/i.test(p.robots || "") || /noindex/i.test(p.xRobots || "");
  if (noindex && !crawled) add("noindex-in-sitemap", "high", "crawl", "Page is in the sitemap but has noindex");

  if (!p.title) add("title-missing", "high", "onpage", "No <title>");
  else if (p.titleLen > 65) add("title-long", "low", "onpage", `Title is ${p.titleLen} characters (Google cuts around 60)`);
  else if (p.titleLen < 15) add("title-short", "low", "onpage", `Title is only ${p.titleLen} characters: "${p.title}"`);

  if (!p.description) add("description-missing", "medium", "onpage", "No meta description");
  else if (p.descriptionLen > 170 || p.descriptionLen < 70) add("description-length", "low", "onpage", `Meta description is ${p.descriptionLen} characters (aim for about 120-160)`);

  if (!p.canonical) add("canonical-missing", "medium", "onpage", "No canonical link");
  else {
    try {
      const c = new URL(p.canonical, p.finalUrl);
      if (!isLocal && c.origin !== origin) add("canonical-foreign", "high", "onpage", `Canonical points to another origin: ${c.href}`);
    } catch {
      add("canonical-invalid", "high", "onpage", `Canonical is not a valid URL: ${p.canonical}`);
    }
  }

  if (!p.viewport) add("viewport-missing", "high", "onpage", "No meta viewport: mobile rendering is likely broken");
  if (!p.lang) add("lang-missing", "low", "onpage", "No lang attribute on <html>");
  if (!p.og.image) add("og-image-missing", "low", "onpage", "No og:image: shared links get no preview image");
  else if (!/^https?:\/\//.test(p.og.image)) add("og-image-relative", "low", "onpage", `og:image is a relative URL: ${p.og.image}`);
  if (p.h1.length === 0) add("h1-missing", "medium", "onpage", "No H1");
  else if (p.h1.length > 1) add("h1-multiple", "low", "onpage", `${p.h1.length} H1 headings`);
  if (p.imgNoAlt.length) add("img-alt-missing", "medium", "onpage", `${p.imgNoAlt.length}/${p.imgCount} images have no alt attribute`);

  if (p.words < 60 && p.scripts >= 5) {
    add("js-rendered-content", "high", "ai", `Only ${p.words} words in the served HTML and ${p.scripts} scripts: the text is probably drawn by JavaScript, which AI crawlers do not run`);
  } else if (p.words < 150) {
    add("thin-content", "medium", "onpage", `Thin page: ${p.words} words of content`);
  }
  for (const j of p.jsonld) if (j.error) add("jsonld-invalid", "high", "onpage", `Broken JSON-LD: ${j.error}`);
  if (p.kb > 500) add("html-heavy", "low", "onpage", `Heavy HTML: ${p.kb} KB`);
  return out;
}

const BUSINESS = /LocalBusiness|Organization|Store|Restaurant|Physician|MedicalBusiness|ProfessionalService|HomeAndConstructionBusiness|Dentist|Attorney|Hotel|LodgingBusiness/i;

export function summarize(pages: OkPage[], phonePrefix?: string): Pick<SiteData, "nap" | "geo"> {
  const phones = new Set(pages.flatMap((p) => p.tel));
  const ldPhones = new Set(pages.flatMap((p) => p.jsonld.map((j) => j.telephone).filter((t): t is string => Boolean(t)).map((t) => normPhone(t, phonePrefix))));
  return {
    nap: {
      phonesInLinks: [...phones],
      phonesInJsonLd: [...ldPhones],
      emails: [...new Set(pages.flatMap((p) => p.mail))],
      whatsapp: pages.some((p) => p.whatsapp),
    },
    geo: {
      questionHeadings: pages.reduce((n, p) => n + p.questionHeadings.length, 0),
      answerBlocks: pages.reduce((n, p) => n + p.answerBlocks, 0),
      nearAnswerBlocks: pages.reduce((n, p) => n + p.nearAnswerBlocks, 0),
      blocksMeasured: pages.reduce((n, p) => n + p.blocksMeasured, 0),
    },
  };
}

export function checkSiteWide(pages: OkPage[], site: Pick<SiteData, "nap" | "geo" | "llmsTxt">, origin: string): Issue[] {
  const out: Issue[] = [];
  const dup = (field: "title" | "description") => {
    const map = new Map<string, string[]>();
    for (const p of pages) {
      const v = p[field];
      if (v) map.set(v, [...(map.get(v) || []), pathOf(p.url)]);
    }
    return [...map.entries()].filter(([, v]) => v.length > 1);
  };
  for (const [t, where] of dup("title")) out.push(issue("title-duplicate", "medium", "onpage", "site", `Duplicate title "${t.slice(0, 60)}"`, where.join(", ")));
  for (const [, where] of dup("description")) out.push(issue("description-duplicate", "medium", "onpage", "site", "Duplicate meta description", where.join(", ")));

  const home = pages[0];
  if (home && !home.jsonld.length) {
    out.push(issue("jsonld-missing-home", "medium", "ai", "site", "No structured data (JSON-LD) on the home page: the business is not described as an entity", pathOf(home.url)));
  }
  const ids = new Set(pages.flatMap((p) => p.jsonld.filter((j) => BUSINESS.test(j.type || "")).map((j) => j.id || "(no @id)")));
  if (ids.size > 1) out.push(issue("entity-split", "medium", "ai", "site", `The business appears as ${ids.size} different entities in JSON-LD: ${[...ids].join(" | ")}`, "JSON-LD"));
  if (pages.some((p) => p.jsonld.some((j) => BUSINESS.test(j.type || "") && j.hasRating))) {
    out.push(issue("self-rating", "info", "onpage", "site", "aggregateRating/review on the business itself: Google ignores self-serving star ratings", "JSON-LD"));
  }

  const { nap, geo } = site;
  const linked = new Set(nap.phonesInLinks);
  for (const ph of nap.phonesInJsonLd) {
    if (linked.size && !linked.has(ph)) {
      out.push(issue("phone-mismatch", "medium", "local", "site", `Phone in JSON-LD (${ph}) differs from the clickable ones on the site (${[...linked].join(", ")})`, "NAP"));
    }
  }
  if (!linked.size && !nap.whatsapp) out.push(issue("no-click-to-call", "medium", "local", "site", "No clickable tel: or WhatsApp link on the audited pages", "contacts"));

  if (!geo.questionHeadings) out.push(issue("no-question-headings", "info", "ai", "site", "No heading phrased as a question: nothing mirrors what people ask answer engines", "all pages"));
  if (!geo.answerBlocks) out.push(issue("no-answer-blocks", "info", "ai", "site", "No 40-60 word answer paragraph after a heading: little that can be quoted as is", "all pages"));
  if (!site.llmsTxt.present) {
    out.push(issue("llms-txt-missing", "low", "ai", "site", "No llms.txt (a weak signal: no major engine has confirmed using it)", `${origin}/llms.txt`));
  }
  return out;
}

export function checkPageSpeed(psi: PageSpeed): Issue[] {
  if (psi.performance === undefined) return [];
  if (psi.performance < 50) return [issue("pagespeed-poor", "high", "onpage", "site", `PageSpeed mobile ${psi.performance}/100 (LCP ${psi.lcp})`, "home")];
  if (psi.performance < 80) return [issue("pagespeed-average", "medium", "onpage", "site", `PageSpeed mobile ${psi.performance}/100 (LCP ${psi.lcp})`, "home")];
  return [];
}

const ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.category.localeCompare(b.category) || a.id.localeCompare(b.id));
}
