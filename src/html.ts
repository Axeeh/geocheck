/**
 * Regex-based HTML reading. No DOM, no dependencies: it only needs to be good
 * enough to measure the head, the headings, the text volume and a few links.
 */
import type { JsonLdItem, PageData } from "./types.js";

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", egrave: "è", eacute: "é", agrave: "à",
  igrave: "ì", ograve: "ò", ugrave: "ù", Egrave: "È", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  hellip: "…", ndash: "–", mdash: "—", middot: "·", laquo: "«", raquo: "»", copy: "©", euro: "€",
  auml: "ä", ouml: "ö", uuml: "ü", szlig: "ß", ccedil: "ç", ntilde: "ñ",
};

export function decode(s = ""): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => NAMED[n] ?? m);
}

export const clean = (s = ""): string => decode(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export const countWords = (s = ""): number => (s.match(/[\p{L}\p{N}’']+/gu) || []).length;

export function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const inner = tag.replace(/^<\s*[a-zA-Z0-9]+/, "").replace(/\/?>$/, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}

export const tags = (html: string, name: string): Record<string, string>[] =>
  (html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || []).map(attrs);

export function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
}

/** Content HTML: <main> if present, otherwise the page without nav, header, footer and aside. */
export function mainHtml(html: string): string {
  const noNoise = stripNoise(html);
  const main = noNoise.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
  if (main) return main;
  return noNoise.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, " ");
}

/**
 * Normalizes a phone number for comparison. "00" becomes "+"; a number without
 * a country code gets `prefix` when one is given (e.g. "+39").
 */
export function normPhone(s: string, prefix?: string): string {
  let raw = s;
  try {
    raw = decodeURIComponent(s);
  } catch {
    // keep the raw value
  }
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+") && prefix && d.length >= 6) d = prefix + d;
  return d;
}

const ASSET = /\.(pdf|jpe?g|png|webp|avif|gif|svg|zip|mp4|webm|mp3)$/i;

function parseJsonLd(html: string): JsonLdItem[] {
  const out: JsonLdItem[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data: unknown = JSON.parse(m[1].trim());
      const roots = Array.isArray(data) ? data : [data];
      const items = roots.flatMap((d) => (d && typeof d === "object" && "@graph" in d ? (d as { "@graph": unknown[] })["@graph"] : [d]));
      for (const raw of items) {
        const it = (raw ?? {}) as Record<string, unknown>;
        out.push({
          type: ([] as unknown[]).concat(it["@type"] ?? "?").join(","),
          id: typeof it["@id"] === "string" ? it["@id"] : null,
          telephone: typeof it.telephone === "string" ? it.telephone : null,
          hasRating: Boolean(it.aggregateRating || it.review),
          sameAs: ([] as unknown[]).concat(it.sameAs ?? []).length,
        });
      }
    } catch (e) {
      out.push({ error: `invalid JSON: ${(e as Error).message.slice(0, 80)}` });
    }
  }
  return out;
}

export function parsePage(url: string, html: string, { origin, phonePrefix }: { origin: string; phonePrefix?: string }): PageData {
  const head = html.match(/<head\b[\s\S]*?<\/head>/i)?.[0] ?? html;
  const metas = tags(head, "meta");
  const links = tags(head, "link");
  const meta = (key: string): string | null =>
    metas.find((m) => (m.name || m.property || "").toLowerCase() === key)?.content ?? null;

  const title = clean(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") || null;
  const canonical = links.find((l) => (l.rel || "").toLowerCase().split(/\s+/).includes("canonical"))?.href ?? null;
  const hreflang = links.filter((l) => l.hreflang).map((l) => `${l.hreflang} → ${l.href}`);
  const icon = links.some((l) => /(^|\s)icon(\s|$)/i.test(l.rel || ""));
  const lang = attrs(html.match(/<html\b[^>]*>/i)?.[0] ?? "<html>").lang || null;

  const body = mainHtml(html);
  const text = clean(body);
  const headings = [...stripNoise(html).matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({
    level: Number(m[1]),
    text: clean(m[2]),
  }));
  const questionHeadings = headings.filter((h) => h.level > 1 && /\?\s*$/.test(h.text)).map((h) => h.text);

  // Answer blocks: the first paragraph after each H2/H3. 40-60 words can be quoted on its own.
  const blocks: { heading: string; words: number }[] = [];
  for (const sec of body.split(/<h[23]\b[^>]*>/i).slice(1)) {
    const heading = clean(sec.split(/<\/h[23]>/i)[0]);
    const p = sec.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    if (p) blocks.push({ heading, words: countWords(clean(p)) });
  }
  const answerBlocks = blocks.filter((b) => b.words >= 40 && b.words <= 60).length;
  const nearAnswerBlocks = blocks.filter((b) => (b.words >= 25 && b.words < 40) || (b.words > 60 && b.words <= 90)).length;

  const imgs = tags(stripNoise(html), "img");
  const imgNoAlt = imgs.filter((i) => !("alt" in i)).map((i) => i.src || i["data-src"] || "?");

  const anchors = tags(html, "a").map((a) => a.href).filter(Boolean);
  const tel = [...new Set(anchors.filter((h) => /^tel:/i.test(h)).map((h) => normPhone(h.slice(4), phonePrefix)))];
  const mail = [...new Set(anchors.filter((h) => /^mailto:/i.test(h)).map((h) => h.slice(7).split("?")[0].toLowerCase()))];
  const whatsapp = anchors.some((h) => /wa\.me|api\.whatsapp\.com/i.test(h));
  const internal = new Set<string>();
  for (const h of anchors) {
    try {
      const u = new URL(h, url);
      if (u.origin === origin && !ASSET.test(u.pathname)) {
        u.hash = "";
        internal.add(u.href);
      }
    } catch {
      // not a URL
    }
  }

  return {
    title,
    titleLen: title?.length ?? 0,
    description: meta("description"),
    descriptionLen: meta("description")?.length ?? 0,
    canonical,
    robots: meta("robots"),
    viewport: Boolean(meta("viewport")),
    lang,
    icon,
    hreflang,
    og: { title: meta("og:title"), description: meta("og:description"), url: meta("og:url"), image: meta("og:image") },
    twitterCard: meta("twitter:card"),
    h1: headings.filter((h) => h.level === 1).map((h) => h.text),
    outline: headings.filter((h) => h.level <= 3).map((h) => `${"  ".repeat(h.level - 1)}H${h.level} ${h.text}`),
    questionHeadings,
    answerBlocks,
    nearAnswerBlocks,
    blocksMeasured: blocks.length,
    words: countWords(text),
    scripts: (html.match(/<script\b/gi) || []).length,
    imgCount: imgs.length,
    imgNoAlt,
    jsonld: parseJsonLd(html),
    tel,
    mail,
    whatsapp,
    internal: [...internal],
  };
}
