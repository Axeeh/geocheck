import { describe, expect, it } from "vitest";
import { decode, normPhone, parsePage } from "../src/html.js";

const origin = "https://example.com";
const answer = "A sourdough loaf takes about twenty hours from the first mix to the moment it leaves the oven, and most of that time it simply rests. " +
  "We mix in the afternoon, let the dough rise slowly overnight in the cold, shape it before dawn and bake it just in time for opening.";

const html = `<!doctype html><html lang="it"><head>
<title>Panetteria a Riverside &amp; dintorni</title>
<meta name="description" content="Pane fatto a mano.">
<link rel="canonical" href="https://example.com/">
<meta property="og:image" content="/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"LocalBusiness","@id":"https://example.com/#biz","telephone":"0123 456789","sameAs":["https://instagram.com/x"]},
  {"@type":"WebSite","@id":"https://example.com/#site"}]}</script>
<script type="application/ld+json">{ broken </script>
</head><body>
<nav><a href="/about">About</a><a href="https://other.com/">Out</a></nav>
<main>
<h1>Panetteria</h1>
<h2>How long does it take to make sourdough bread?</h2>
<p>${answer}</p>
<img src="/a.jpg" alt="Loaves cooling on a rack"><img src="/b.jpg">
<a href="tel:+39 0123 456789">Call</a><a href="mailto:Info@Example.com?subject=hi">Mail</a>
<a href="https://wa.me/39333">WhatsApp</a><a href="/brochure.pdf">PDF</a><a href="/contact#form">Contact</a>
</main></body></html>`;

describe("parsePage", () => {
  const p = parsePage(`${origin}/`, html, { origin, phonePrefix: "+39" });

  it("reads the head", () => {
    expect(p.title).toBe("Panetteria a Riverside & dintorni");
    expect(p.description).toBe("Pane fatto a mano.");
    expect(p.canonical).toBe("https://example.com/");
    expect(p.lang).toBe("it");
    expect(p.og.image).toBe("/og.jpg");
    expect(p.viewport).toBe(false);
  });

  it("finds headings, question headings and answer blocks", () => {
    expect(p.h1).toEqual(["Panetteria"]);
    expect(p.questionHeadings).toEqual(["How long does it take to make sourdough bread?"]);
    expect(p.answerBlocks).toBe(1);
  });

  it("reads JSON-LD graphs and reports broken blocks", () => {
    const biz = p.jsonld.find((j) => j.type === "LocalBusiness");
    expect(biz).toMatchObject({ id: "https://example.com/#biz", telephone: "0123 456789", sameAs: 1 });
    expect(p.jsonld.some((j) => j.error?.startsWith("invalid JSON"))).toBe(true);
  });

  it("collects contacts and internal links", () => {
    expect(p.tel).toEqual(["+390123456789"]);
    expect(p.mail).toEqual(["info@example.com"]);
    expect(p.whatsapp).toBe(true);
    expect(p.internal).toEqual(["https://example.com/about", "https://example.com/contact"]);
  });

  it("counts images without alt", () => {
    expect(p.imgCount).toBe(2);
    expect(p.imgNoAlt).toEqual(["/b.jpg"]);
  });
});

describe("normPhone", () => {
  it("turns 00 into + and applies the prefix only when asked", () => {
    expect(normPhone("0039 0123 456789")).toBe("+390123456789");
    expect(normPhone("0123-456789")).toBe("0123456789");
    expect(normPhone("0123-456789", "+39")).toBe("+390123456789");
    expect(normPhone("%2B39%20333%201234567")).toBe("+393331234567");
  });
});

describe("decode", () => {
  it("decodes numeric and named entities", () => {
    expect(decode("&#233;t&eacute; &#x2019; &unknown;")).toBe("été ’ &unknown;");
  });
});
