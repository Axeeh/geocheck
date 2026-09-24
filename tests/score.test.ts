import { describe, expect, it } from "vitest";
import { computeScore } from "../src/score.js";
import type { Issue } from "../src/types.js";

const site = (id: string, severity: Issue["severity"], category: Issue["category"]): Issue => ({ id, severity, category, scope: "site", message: id });
const onPage = (id: string, where: string): Issue => ({ id, severity: "medium", category: "onpage", scope: "page", message: id, where });

describe("computeScore", () => {
  it("is 100 everywhere without issues", () => {
    expect(computeScore([], 5)).toEqual({ overall: 100, categories: { crawl: 100, onpage: 100, ai: 100, local: 100 } });
  });

  it("charges a site-scoped rule once, whatever the count", () => {
    const s = computeScore([site("robots-missing", "medium", "crawl")], 5);
    expect(s.categories.crawl).toBe(92);
  });

  it("scales a page-scoped rule with the share of pages it affects", () => {
    const one = computeScore([onPage("h1-missing", "/a")], 4).categories.onpage;
    const all = computeScore(["/a", "/b", "/c", "/d"].map((p) => onPage("h1-missing", p)), 4).categories.onpage;
    expect(one).toBe(100 - Math.round(8 * (0.5 + 0.5 / 4)));
    expect(all).toBe(92);
    expect(one).toBeGreaterThan(all);
  });

  it("does not charge info issues and never goes below zero", () => {
    expect(computeScore([site("no-answer-blocks", "info", "ai")], 1).categories.ai).toBe(100);
    const many = Array.from({ length: 10 }, (_, i) => site(`x${i}`, "high", "ai"));
    expect(computeScore(many, 1).categories.ai).toBe(0);
  });

  it("weights the overall score by category", () => {
    const s = computeScore(Array.from({ length: 5 }, (_, i) => site(`x${i}`, "high", "local")), 1);
    expect(s.categories.local).toBe(0);
    expect(s.overall).toBe(85);
  });
});
