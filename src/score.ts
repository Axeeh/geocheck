/**
 * An explainable score, not a ranking factor. Each category starts at 100 and
 * loses points per rule that fired:
 *   - a site-scoped rule costs its full weight once;
 *   - a page-scoped rule costs between half and all of its weight, depending
 *     on the share of audited pages it affects.
 * The overall score is a weighted mean of the four categories.
 */
import type { Category, Issue, ScoreCard, Severity } from "./types.js";

export const SEVERITY_WEIGHT: Record<Severity, number> = { high: 20, medium: 8, low: 3, info: 0 };
export const CATEGORY_WEIGHT: Record<Category, number> = { crawl: 0.3, onpage: 0.25, ai: 0.3, local: 0.15 };
export const CATEGORIES: Category[] = ["crawl", "onpage", "ai", "local"];

export function computeScore(issues: Issue[], pagesAudited: number): ScoreCard {
  const penalty: Record<Category, number> = { crawl: 0, onpage: 0, ai: 0, local: 0 };
  const byRule = new Map<string, Issue[]>();
  for (const i of issues) {
    const key = `${i.category}:${i.id}`;
    byRule.set(key, [...(byRule.get(key) || []), i]);
  }
  for (const list of byRule.values()) {
    const weight = Math.max(...list.map((i) => SEVERITY_WEIGHT[i.severity]));
    const first = list[0];
    if (first.scope === "page") {
      const affected = new Set(list.map((i) => i.where)).size;
      penalty[first.category] += weight * (0.5 + 0.5 * Math.min(1, affected / Math.max(1, pagesAudited)));
    } else {
      penalty[first.category] += weight;
    }
  }
  const categories = Object.fromEntries(
    CATEGORIES.map((c) => [c, Math.max(0, Math.round(100 - penalty[c]))]),
  ) as Record<Category, number>;
  const overall = Math.round(CATEGORIES.reduce((sum, c) => sum + categories[c] * CATEGORY_WEIGHT[c], 0));
  return { overall, categories };
}
