export type Severity = "high" | "medium" | "low" | "info";

/** crawl = can engines reach and index it; onpage = head and markup basics; ai = can answer engines read and cite it; local = contact and business signals. */
export type Category = "crawl" | "onpage" | "ai" | "local";

/** A page-scoped issue is weighted by how many pages it affects; a site-scoped one counts once. */
export type Scope = "site" | "page";

export interface Issue {
  /** Stable rule id, documented in docs/checks.md. */
  id: string;
  severity: Severity;
  category: Category;
  scope: Scope;
  message: string;
  /** Page path, file or area the issue was measured on. */
  where?: string;
}

export interface FetchResult {
  status: number;
  url: string;
  headers?: Headers;
  body: string;
  ms: number;
  error?: string;
}

export interface Hop {
  url: string;
  status: number;
  error?: string;
}

export type BotKind = "search" | "training";
export type BotStatus = "allowed" | "partial" | "blocked" | "unknown";

export interface BotVerdict {
  name: string;
  kind: BotKind;
  status: BotStatus;
  /** The robots.txt group that applies, or why none does. */
  group: string;
}

export interface JsonLdItem {
  type?: string;
  id?: string | null;
  telephone?: string | null;
  hasRating?: boolean;
  sameAs?: number;
  error?: string;
}

export interface PageData {
  title: string | null;
  titleLen: number;
  description: string | null;
  descriptionLen: number;
  canonical: string | null;
  robots: string | null;
  viewport: boolean;
  lang: string | null;
  icon: boolean;
  hreflang: string[];
  og: { title: string | null; description: string | null; url: string | null; image: string | null };
  twitterCard: string | null;
  h1: string[];
  outline: string[];
  questionHeadings: string[];
  /** First paragraphs after an H2/H3 that are 40-60 words long: quotable on their own. */
  answerBlocks: number;
  nearAnswerBlocks: number;
  blocksMeasured: number;
  words: number;
  scripts: number;
  imgCount: number;
  imgNoAlt: string[];
  jsonld: JsonLdItem[];
  tel: string[];
  mail: string[];
  whatsapp: boolean;
  internal: string[];
}

export type PageResult =
  | { ok: false; url: string; status: number; error?: string }
  | ({ ok: true; url: string; status: number; finalUrl: string; ms: number; kb: number; xRobots: string | null } & PageData);

export interface PageSpeed {
  performance?: number;
  seo?: number;
  accessibility?: number;
  lcp?: string;
  cls?: string;
  tbt?: string;
  error?: string;
}

export interface SiteData {
  /** The origin actually audited: the home page's final URL when it redirects to another host. */
  start: string;
  /** The URL that was asked for, when it redirected to another host. */
  redirectedFrom?: string;
  isLocal: boolean;
  date: string;
  home: { status: number; finalUrl: string; ms: number; kb: number; error?: string };
  redirects?: { http: Hop[]; alt: Hop[]; altHost: string; note?: string };
  robots: { status: number; sitemaps: string[]; raw?: string; note?: string };
  bots: BotVerdict[];
  llmsTxt: { status: number; present: boolean };
  sitemap: { read: Hop[]; count: number; crawled: boolean };
  sitemapStatus: { url: string; status: number; location: string | null }[];
  nap: { phonesInLinks: string[]; phonesInJsonLd: string[]; emails: string[]; whatsapp: boolean };
  geo: { questionHeadings: number; answerBlocks: number; nearAnswerBlocks: number; blocksMeasured: number };
  pageSpeed?: PageSpeed;
}

export interface ScoreCard {
  overall: number;
  categories: Record<Category, number>;
}

export interface AuditResult {
  site: SiteData;
  pages: PageResult[];
  issues: Issue[];
  score: ScoreCard;
}

export interface AuditOptions {
  url: string;
  /** Pages to parse (default 30). */
  maxPages?: number;
  /** Sitemap URLs to status-check (default 200). */
  maxCheck?: number;
  /** Country prefix for local phone numbers, e.g. "+39". Without it numbers are compared as written. */
  phonePrefix?: string;
  /** Add PageSpeed Insights mobile scores for the home page. */
  pageSpeed?: boolean;
  pageSpeedKey?: string;
  timeoutMs?: number;
  userAgent?: string;
  /** Injected fetch, for tests. */
  fetch?: typeof globalThis.fetch;
  /** Called with short progress messages. */
  onProgress?: (message: string) => void;
}
