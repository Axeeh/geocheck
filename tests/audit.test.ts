import { describe, expect, it } from "vitest";
import { runAudit, UnreachableError } from "../src/audit.js";
import { formatMarkdown } from "../src/report/markdown.js";
import { formatText } from "../src/report/text.js";
import { fakeFetch, page } from "./helpers.js";

const SITEMAP = `<?xml version="1.0"?><urlset>
<url><loc>https://example.com/</loc></url>
<url><loc>https://example.com/about</loc></url>
<url><loc>https://example.com/old</loc></url>
</urlset>`;

const healthy = {
  "https://example.com/": page(),
  "http://example.com/": { status: 301, headers: { location: "https://example.com/" } },
  "https://www.example.com/": { status: 301, headers: { location: "https://example.com/" } },
  "https://example.com/robots.txt": "User-agent: *\nAllow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml",
  "https://example.com/sitemap.xml": SITEMAP,
  "https://example.com/about": page({ title: "About us | Example Bakery", canonical: "https://example.com/about", h1: null }),
  "https://example.com/old": { status: 301, headers: { location: "https://example.com/about" } },
};

const ids = (r: Awaited<ReturnType<typeof runAudit>>) => r.issues.map((i) => i.id);

describe("runAudit", () => {
  it("audits a site from its sitemap and reports measured problems", async () => {
    const r = await runAudit({ url: "https://example.com/", fetch: fakeFetch(healthy), phonePrefix: "+39" });

    expect(r.site.sitemap).toMatchObject({ count: 3, crawled: false });
    expect(r.pages.filter((p) => p.ok).map((p) => p.url)).toEqual(["https://example.com/", "https://example.com/about"]);
    expect(r.site.bots.find((b) => b.name === "PerplexityBot")?.status).toBe("blocked");

    expect(ids(r)).toContain("ai-bot-blocked:PerplexityBot");
    expect(ids(r)).toContain("sitemap-url-redirect");
    expect(ids(r)).toContain("h1-missing");
    expect(ids(r)).toContain("jsonld-missing-home");
    expect(ids(r)).toContain("llms-txt-missing");
    expect(ids(r)).not.toContain("http-not-https");
    expect(ids(r)).not.toContain("duplicate-host");
    expect(ids(r)).not.toContain("no-click-to-call");

    // Sorted by severity: the blocked AI crawler comes first.
    expect(r.issues[0].severity).toBe("high");
    expect(r.score.categories.ai).toBeLessThan(r.score.categories.crawl);
  });

  it("flags missing https redirect and a duplicate www host", async () => {
    const r = await runAudit({
      url: "https://example.com/",
      fetch: fakeFetch({
        ...healthy,
        "http://example.com/": page(),
        "https://www.example.com/": page(),
      }),
    });
    expect(ids(r)).toEqual(expect.arrayContaining(["http-not-https", "duplicate-host"]));
  });

  it("follows a redirect to the canonical host and audits that host, without false alarms", async () => {
    // The site lives on www; the apex only redirects there.
    const www = (u: string) => u.replace("https://example.com", "https://www.example.com");
    const onWww: Record<string, string | { status: number; headers: Record<string, string> }> = {};
    for (const [k, v] of Object.entries(healthy)) {
      if (k.startsWith("https://example.com")) {
        onWww[www(k)] = typeof v === "string"
          ? v.replaceAll("https://example.com", "https://www.example.com")
          : { ...v, headers: { location: www(v.headers.location) } };
      }
    }
    const r = await runAudit({
      url: "https://example.com/",
      fetch: fakeFetch({
        ...onWww,
        "https://www.example.com/": page({ canonical: "https://www.example.com/" }),
        "https://www.example.com/about": page({ title: "About us | Example Bakery", canonical: "https://www.example.com/about", h1: null }),
        "https://example.com/": { status: 301, headers: { location: "https://www.example.com/" } },
        "http://www.example.com/": { status: 301, headers: { location: "https://www.example.com/" } },
      }),
    });
    expect(r.site.start).toBe("https://www.example.com/");
    expect(r.site.redirectedFrom).toBe("https://example.com/");
    expect(r.pages.filter((p) => p.ok)).toHaveLength(2);
    expect(ids(r)).not.toContain("sitemap-foreign-urls");
    expect(ids(r)).not.toContain("canonical-foreign");
    expect(ids(r)).not.toContain("duplicate-host");
    expect(ids(r)).not.toContain("http-not-https");
  });

  it("crawls links when there is no sitemap and never reports a robots.txt it could not read as missing", async () => {
    const r = await runAudit({
      url: "http://localhost:4321/",
      fetch: fakeFetch({
        "http://localhost:4321/": page({ body: '<a href="/contact">Contact</a>' }),
        "http://localhost:4321/contact": page({ title: "Contact | Example Bakery" }),
      }),
    });
    expect(r.site.isLocal).toBe(true);
    expect(r.site.redirects).toBeUndefined();
    expect(r.site.sitemap.crawled).toBe(true);
    expect(r.pages.map((p) => p.url)).toEqual(["http://localhost:4321/", "http://localhost:4321/contact"]);
    expect(ids(r)).toEqual(expect.arrayContaining(["sitemap-missing", "robots-missing"]));
  });

  it("detects content drawn by JavaScript", async () => {
    const shell = `<!doctype html><html lang="en"><head><title>App shell for a bakery</title></head><body><div id="root"></div>${"<script src=x.js></script>".repeat(6)}</body></html>`;
    const r = await runAudit({ url: "http://localhost:3000/", fetch: fakeFetch({ "http://localhost:3000/": shell }) });
    expect(ids(r)).toContain("js-rendered-content");
  });

  it("throws UnreachableError instead of inventing problems when the home does not answer", async () => {
    await expect(runAudit({ url: "https://nowhere.example/", fetch: fakeFetch({}) })).rejects.toBeInstanceOf(UnreachableError);
  });

  it("renders text and markdown reports", async () => {
    const r = await runAudit({ url: "https://example.com/", fetch: fakeFetch(healthy) });
    const text = formatText(r);
    expect(text).toContain("Score");
    expect(text).toContain("PerplexityBot");
    const md = formatMarkdown(r);
    expect(md).toContain("# geocheck report: https://example.com/");
    expect(md).toContain("`ai-bot-blocked:PerplexityBot`");
  });
});
