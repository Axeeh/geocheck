import { CATEGORIES } from "../score.js";
import { CATEGORY_LABEL } from "./labels.js";
import type { AuditResult, Severity } from "../types.js";

export interface TextOptions {
  color?: boolean;
  /** Issues listed before "and N more" (default 15). */
  limit?: number;
}

const ANSI = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", cyan: "\x1b[36m" };

export function formatText(result: AuditResult, { color = false, limit = 15 }: TextOptions = {}): string {
  const c = (code: keyof typeof ANSI, s: string) => (color ? ANSI[code] + s + ANSI.reset : s);
  const tone = (n: number) => (n >= 80 ? "green" : n >= 50 ? "yellow" : "red") as keyof typeof ANSI;
  const bar = (n: number) => "█".repeat(Math.round(n / 5)) + c("dim", "░".repeat(20 - Math.round(n / 5)));
  const sevLabel: Record<Severity, string> = { high: c("red", "HIGH  "), medium: c("yellow", "MEDIUM"), low: c("cyan", "LOW   "), info: c("dim", "INFO  ") };

  const { site, pages, issues, score } = result;
  const L: string[] = [];
  L.push(`${c("bold", "geocheck")}  ${site.start}  ${c("dim", site.date)}`);
  if (site.redirectedFrom) L.push(c("dim", `(${site.redirectedFrom} redirects here, so this is the host audited)`));
  L.push(c("dim", `${pages.length} pages audited (${site.sitemap.crawled ? "crawled from links, no sitemap" : "from the sitemap"}), ${site.sitemap.count} URLs in sitemap`));
  L.push("");
  L.push(`${c("bold", "Score")}  ${c(tone(score.overall), c("bold", `${score.overall}/100`))}`);
  for (const cat of CATEGORIES) {
    const n = score.categories[cat];
    L.push(`  ${CATEGORY_LABEL[cat].padEnd(14)} ${c(tone(n), bar(n))} ${String(n).padStart(3)}`);
  }
  L.push("");

  const blocked = site.bots.filter((b) => b.status === "blocked");
  const unknown = site.bots.some((b) => b.status === "unknown");
  L.push(unknown
    ? `Crawlers: ${c("yellow", "robots.txt could not be read, rules unknown")}`
    : `Crawlers: ${site.bots.length - blocked.length} allowed${blocked.length ? `, ${c("red", `${blocked.length} blocked`)} (${blocked.map((b) => `${b.name}${b.kind === "training" ? " [training]" : ""}`).join(", ")})` : ""}`);
  L.push(`AI signals: ${site.geo.questionHeadings} question headings, ${site.geo.answerBlocks} answer blocks, llms.txt ${site.llmsTxt.present ? "present" : "absent"}`);
  if (site.pageSpeed) {
    L.push(site.pageSpeed.error ? `PageSpeed: ${c("dim", site.pageSpeed.error)}` : `PageSpeed mobile: ${site.pageSpeed.performance}/100, LCP ${site.pageSpeed.lcp}`);
  }
  L.push("");

  const count = (s: Severity) => issues.filter((i) => i.severity === s).length;
  L.push(c("bold", `Issues`) + c("dim", ` (${count("high")} high, ${count("medium")} medium, ${count("low")} low, ${count("info")} info)`));
  if (!issues.length) L.push("  None measured.");
  for (const i of issues.slice(0, limit)) {
    L.push(`  ${sevLabel[i.severity]} ${c("dim", i.category.padEnd(6))} ${i.message}${i.where ? c("dim", `  ${i.where}`) : ""}`);
  }
  if (issues.length > limit) L.push(c("dim", `  ... and ${issues.length - limit} more. Use --format md or --format json for the full list.`));
  return L.join("\n");
}
