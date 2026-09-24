import { CATEGORIES } from "../score.js";
import { pathOf } from "../checks.js";
import { CATEGORY_LABEL } from "./labels.js";
import type { AuditResult } from "../types.js";

const cell = (s: string) => s.replace(/\|/g, "\\|");

export function formatMarkdown({ site, pages, issues, score }: AuditResult): string {
  const L: string[] = [];
  L.push(`# geocheck report: ${site.start}`, "");
  L.push(`Date: ${site.date} · pages audited: ${pages.length}${site.sitemap.crawled ? " (crawled from links, no sitemap)" : " (from the sitemap)"} · URLs in sitemap: ${site.sitemap.count}`, "");

  L.push("## Score", "", "| Category | Score |", "|---|---|");
  for (const c of CATEGORIES) L.push(`| ${CATEGORY_LABEL[c]} | ${score.categories[c]} |`);
  L.push(`| **Overall** | **${score.overall}** |`, "");

  L.push("## Site", "");
  if (site.redirectedFrom) L.push(`- Requested ${site.redirectedFrom}, which redirects here: this host was audited`);
  L.push(`- Home: status ${site.home.status}, ${site.home.ms} ms, ${site.home.kb} KB${site.home.finalUrl !== site.start ? `, ends on ${site.home.finalUrl}` : ""}`);
  if (site.redirects) {
    L.push(`- http → ${site.redirects.http.map((h) => h.status || h.error).join(" → ")} (${site.redirects.http.at(-1)?.url})`);
    L.push(`- ${site.redirects.altHost} → ${site.redirects.alt.map((h) => h.status || h.error).join(" → ")} (${site.redirects.alt.at(-1)?.url})`);
    if (site.redirects.note) L.push(`- ${site.redirects.note}`);
  }
  L.push(`- robots.txt: ${site.robots.note ?? site.robots.status}${site.robots.sitemaps.length ? `, sitemap: ${site.robots.sitemaps.join(", ")}` : ""}`);
  L.push(`- Sitemaps read: ${site.sitemap.read.map((s) => `${s.url} (${s.status || s.error})`).join(", ") || "none"}`);
  L.push(`- llms.txt: ${site.llmsTxt.present ? "present" : "absent"}`);
  if (site.pageSpeed) {
    const p = site.pageSpeed;
    L.push(`- PageSpeed mobile: ${p.error ?? `performance ${p.performance}, SEO ${p.seo}, accessibility ${p.accessibility}, LCP ${p.lcp}, CLS ${p.cls}`}`);
  }
  const n = site.nap;
  L.push(`- Clickable contacts: tel ${n.phonesInLinks.join(", ") || "none"} · JSON-LD tel ${n.phonesInJsonLd.join(", ") || "none"} · email ${n.emails.join(", ") || "none"} · WhatsApp ${n.whatsapp ? "yes" : "no"}`, "");

  L.push("## Crawlers (robots.txt)", "", "| Crawler | Kind | Status | Rule group |", "|---|---|---|---|");
  for (const b of site.bots) L.push(`| ${b.name} | ${b.kind} | ${b.status} | ${cell(b.group)} |`);
  L.push("");

  L.push("## AI readiness, raw measures", "");
  L.push(`- Question headings: ${site.geo.questionHeadings}`);
  L.push(`- Answer blocks of 40-60 words: ${site.geo.answerBlocks} (close: ${site.geo.nearAnswerBlocks}) out of ${site.geo.blocksMeasured} sections measured`, "");

  L.push("## Pages", "", "| Page | Status | Title (chars) | Description (chars) | Canonical | H1 | Words | Images without alt | JSON-LD |", "|---|---|---|---|---|---|---|---|---|");
  for (const p of pages) {
    if (!p.ok) {
      L.push(`| ${pathOf(p.url)} | ${p.status || p.error} | | | | | | | |`);
      continue;
    }
    const ld = p.jsonld.map((j) => (j.error ? "ERROR" : j.type)).join(", ") || "-";
    L.push(`| ${pathOf(p.url)} | 200 | ${p.titleLen} | ${p.descriptionLen} | ${p.canonical ? "yes" : "**no**"} | ${p.h1.length} | ${p.words} | ${p.imgNoAlt.length}/${p.imgCount} | ${cell(ld)} |`);
  }
  L.push("");

  L.push("## Issues", "");
  if (!issues.length) L.push("None measured.");
  for (const i of issues) L.push(`- **[${i.severity}]** (${i.category}) ${i.message}${i.where ? ` · _${i.where}_` : ""} \`${i.id}\``);
  L.push("");
  return L.join("\n");
}
