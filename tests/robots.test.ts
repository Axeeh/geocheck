import { describe, expect, it } from "vitest";
import { parseRobots } from "../src/robots.js";

const status = (txt: string, bot: string) => parseRobots(txt).bots.find((b) => b.name === bot)?.status;

describe("parseRobots", () => {
  it("allows everything when there are no rules", () => {
    expect(status("", "Googlebot")).toBe("allowed");
    expect(status("", "GPTBot")).toBe("allowed");
  });

  it("applies the * group to bots without their own group", () => {
    const txt = "User-agent: *\nDisallow: /";
    expect(status(txt, "PerplexityBot")).toBe("blocked");
  });

  it("prefers a bot's own group over *", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /";
    expect(status(txt, "OAI-SearchBot")).toBe("allowed");
    expect(status(txt, "Bingbot")).toBe("blocked");
  });

  it("groups consecutive user-agent lines together", () => {
    const txt = "User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /";
    expect(status(txt, "GPTBot")).toBe("blocked");
    expect(status(txt, "CCBot")).toBe("blocked");
    expect(status(txt, "Googlebot")).toBe("allowed");
  });

  it("treats an empty Disallow as allow-all and a subpath as partial", () => {
    expect(status("User-agent: *\nDisallow:", "Googlebot")).toBe("allowed");
    expect(status("User-agent: *\nDisallow: /admin/", "Googlebot")).toBe("partial");
  });

  it("is case-insensitive on agent names and ignores comments", () => {
    const txt = "user-agent: claude-searchbot # the search one\ndisallow: /";
    expect(status(txt, "Claude-SearchBot")).toBe("blocked");
  });

  it("collects Sitemap lines, keeping the colon in the URL", () => {
    expect(parseRobots("Sitemap: https://example.com/sitemap.xml").sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });
});
