# Checks

Every issue geocheck reports has a stable id. Scope `site` means the rule
fires once for the whole site; `page` means it fires per page and its score
cost grows with the share of pages affected (see the README).

Severity guide: **high** costs visibility now, **medium** is a clear gain for
contained work, **low** is hygiene, **info** is context with no score cost.

## Crawl & index

| Id | Severity | Scope | What and why |
|---|---|---|---|
| `home-status` | high | site | The home page does not answer 200. |
| `http-not-https` | high | site | `http://` never reaches `https://`: browsers warn, engines may index the insecure copy. |
| `redirect-chain` | low | site | More than two hops from `http://`. Each hop costs time and crawl budget. |
| `duplicate-host` | medium | site | `www` and the apex both answer 200 without redirecting: two copies of the same site compete. Skipped on localhost. |
| `robots-missing` | medium | site | No robots.txt. Not fatal, but it is where the sitemap and crawler rules are declared. Not reported when the file could not be fetched at all. |
| `robots-no-sitemap` | low | site | robots.txt has no `Sitemap:` line. |
| `search-bot-blocked` | high | site | Googlebot or Bingbot is blocked from the whole site. |
| `sitemap-missing` | medium | site | No readable sitemap at the robots.txt location or the usual paths. |
| `sitemap-foreign-urls` | high | site | Sitemap URLs on another host or protocol, usually a leftover from a migration. |
| `sitemap-url-redirect` | medium | site | Sitemap URLs that redirect. List the final URL. |
| `sitemap-url-error` | high | site | Sitemap URLs that answer 4xx/5xx or nothing. |
| `noindex-in-sitemap` | high | page | The page asks not to be indexed but the sitemap asks for it. |

## On-page

| Id | Severity | Scope | What and why |
|---|---|---|---|
| `title-missing` | high | page | No `<title>`. |
| `title-long` / `title-short` | low | page | Over 65 or under 15 characters. |
| `title-duplicate` | medium | site | The same title on several pages. |
| `description-missing` | medium | page | No meta description: engines write their own snippet. |
| `description-length` | low | page | Outside 70-170 characters. |
| `description-duplicate` | medium | site | The same description on several pages. |
| `canonical-missing` | medium | page | No canonical link. |
| `canonical-foreign` | high | page | Canonical points to another origin: the page asks to be ignored in favour of another site. |
| `canonical-invalid` | high | page | Canonical is not a valid URL. |
| `viewport-missing` | high | page | No meta viewport. Check the layout on a phone before calling it broken. |
| `lang-missing` | low | page | No `lang` on `<html>`. |
| `og-image-missing` / `og-image-relative` | low | page | Shared links get no preview, or a broken one. |
| `h1-missing` / `h1-multiple` | medium / low | page | No H1, or several. |
| `img-alt-missing` | medium | page | Images without an `alt` attribute (an empty `alt=""` counts as present: it is right for decoration). |
| `thin-content` | medium | page | Under 150 words of content outside nav, header and footer. Can be fine on a gallery: judge it. |
| `jsonld-invalid` | high | page | A JSON-LD block that does not parse: engines ignore all of it. |
| `html-heavy` | low | page | HTML document over 500 KB. |
| `pagespeed-poor` / `pagespeed-average` | high / medium | site | PageSpeed mobile performance under 50 / under 80. Only with `--pagespeed`. |
| `self-rating` | info | site | `aggregateRating` or `review` on the business itself: Google does not show self-serving stars. |

## AI readiness

| Id | Severity | Scope | What and why |
|---|---|---|---|
| `ai-bot-blocked:<bot>` | high | site | An AI **search** crawler (OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot, Claude-User) is blocked: that engine cannot fetch the page to answer. Training crawlers are listed but never flagged. |
| `js-rendered-content` | high | page | Under 60 words in the served HTML and 5+ scripts: the content is drawn by JavaScript, which AI crawlers generally do not run. |
| `jsonld-missing-home` | medium | site | No JSON-LD on the home page: the business is not described as an entity (name, address, phone, same-as profiles). |
| `entity-split` | medium | site | Business-type JSON-LD with different `@id`s across pages: one business looks like several. |
| `no-question-headings` | info | site | No heading phrased as a question. |
| `no-answer-blocks` | info | site | No 40-60 word first paragraph after an H2/H3, the length that can be quoted as a standalone answer. |
| `llms-txt-missing` | low | site | No `/llms.txt`. A weak signal: no major engine has confirmed using it. Kept low on purpose. |

## Local

| Id | Severity | Scope | What and why |
|---|---|---|---|
| `phone-mismatch` | medium | site | The JSON-LD phone differs from the clickable ones. Use `--phone-prefix` so local and international formats compare equal. |
| `no-click-to-call` | medium | site | No `tel:` or WhatsApp link on the audited pages. |
