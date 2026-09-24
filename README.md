# geocheck

**How findable is a website on Google and in AI answer engines?**

geocheck audits a site the way search engines and AI answer engines
(ChatGPT search, Perplexity, Claude, Google AI Overviews) meet it: can their
crawlers get in, is the content in the HTML they receive, is the business
described as an entity, is there anything short and clear enough to quote.
It gives an explainable score and a list of problems, each one a measurement
with the page it was measured on.

```bash
npx geocheck example.com
```

```
geocheck  https://www.example.com/  2026-09-24
30 pages audited (from the sitemap), 35 URLs in sitemap

Score  82/100
  Crawl & index  ████████████████████ 100
  On-page        ███████████████░░░░░  76
  AI readiness   ████████████░░░░░░░░  60
  Local          ████████████████████ 100

Crawlers: 11 allowed, 1 blocked (PerplexityBot)
AI signals: 4 question headings, 2 answer blocks, llms.txt absent

Issues (1 high, 3 medium, 6 low, 1 info)
  HIGH   ai     PerplexityBot is blocked in robots.txt: the site cannot be fetched to answer questions in that engine
  MEDIUM onpage 3/12 images have no alt attribute  /gallery
  ...
```

Zero runtime dependencies, Node 20+. Works on live sites and on a dev server
(`http://localhost:4321`), so you can check a site before it launches.

## Why

SEO tools are everywhere. Very few tell you whether an AI answer engine can
read and cite your site, and most of what is written about "GEO" is advice
you cannot verify. geocheck sticks to what can be measured from the outside
and says so when it could not measure something: a robots.txt that did not
load is reported as *unknown*, never as *missing*, and a site that does not
answer stops the audit instead of producing a page of invented problems.

It started as the audit script of a small Italian web studio, used on every
client site before launch and on prospects' sites before a first call.

## What it checks

| Category | Checks |
|---|---|
| **Crawl & index** | http to https redirect, www and apex answering as two sites, redirect chains, robots.txt, Googlebot and Bingbot rules, sitemap (and sitemap indexes), the status of every sitemap URL, URLs on another host, `noindex` pages listed in the sitemap |
| **On-page** | title, meta description, canonical, viewport, `lang`, H1, image `alt`, Open Graph image, thin pages, broken JSON-LD, duplicate titles and descriptions, optional PageSpeed mobile score |
| **AI readiness** | robots.txt rules for 10 AI crawlers (search and training bots kept apart), text that only exists after JavaScript runs, JSON-LD business entity on the home page, the same business split across different `@id`s, headings phrased as questions, 40-60 word answer paragraphs, `llms.txt` |
| **Local** | clickable phone or WhatsApp links, phone numbers that differ between the page and the JSON-LD |

Every rule has a stable id, a severity and a reason in
[docs/checks.md](docs/checks.md).

Blocking a **training** crawler (GPTBot, ClaudeBot, Google-Extended, CCBot,
Applebot-Extended) is a legitimate choice and is never reported as a problem.
Blocking a **search** crawler (OAI-SearchBot, ChatGPT-User, PerplexityBot,
Claude-SearchBot, Claude-User) is, because that engine can then no longer
fetch the page to answer a question.

## The score

Each category starts at 100 and loses points for every rule that fired:
high 20, medium 8, low 3, info 0. A rule that fires on the whole site counts
once; a rule that fires on pages costs between half and all of its weight,
depending on the share of pages it affects. The overall score weights crawl
30%, on-page 25%, AI readiness 30%, local 15%.

It is a way to compare a site with itself over time, not a ranking factor.
Nobody outside Google or OpenAI knows their weights, and geocheck does not
pretend to.

## Usage

```bash
geocheck <url> [options]
```

| Option | Default | |
|---|---|---|
| `--format <text\|md\|json>` | `text` | Output format |
| `-o, --output <file>` | | Write the report to a file, print a short summary |
| `--max-pages <n>` | `30` | Pages to parse |
| `--max-check <n>` | `200` | Sitemap URLs to status-check |
| `--phone-prefix <+cc>` | | Country prefix for local numbers, e.g. `+39`, so `0123 456789` and `+39 0123 456789` compare equal |
| `--fail-on <level>` | `never` | Exit 1 if an issue at `high`, `medium` or `low` or above exists |
| `--min-score <n>` | | Exit 1 if the overall score is below `n` |
| `--pagespeed` | | Add PageSpeed Insights mobile scores (reads `PAGESPEED_API_KEY` if set) |
| `--timeout <ms>` | `15000` | Per-request timeout |
| `--quiet` | | No progress messages |

Exit codes: `0` done, `1` a threshold was hit, `2` the site did not answer
(nothing was checked), `3` wrong usage.

Pages come from the sitemap. Without one, geocheck follows internal links
from the home page. On `localhost` it reads the local sitemap and maps its
URLs to the dev server, so a site can be checked before it has a domain.

### In CI

```yaml
- uses: Axeeh/geocheck@v0
  with:
    url: https://staging.example.com
    fail-on: high
```

The action writes the Markdown report to the job summary. Inputs: `url`
(required), `fail-on` (default `high`), `min-score`, `max-pages`, `version`
(npm version, default `latest`).

### As a library

```ts
import { runAudit, formatMarkdown } from "geocheck";

const result = await runAudit({ url: "https://example.com", maxPages: 50 });
console.log(result.score.overall, result.issues.filter((i) => i.severity === "high"));
```

`result` has `site` (redirects, robots rules per crawler, sitemap, contacts,
AI measures), `pages` (everything measured per page), `issues` and `score`.
The JSON output is the same object.

## What it does not do

- It does not run JavaScript. That is on purpose: most AI crawlers do not
  either, so "the text only appears after JavaScript" is one of the findings.
- It does not ask an AI engine whether it cites you. That is the next thing
  on the roadmap, and until then a clean report is not proof of being cited.
- It does not read Google Search Console, the Google Business Profile or
  reviews. Local SEO beyond the site itself needs those.
- It does not fix anything. Every issue says what was measured and where.

## Roadmap

- [ ] **Field test**: ask answer engines the questions a customer would ask
      ("bakery open on Sunday near Riverside") and report whether the site is cited, and
      who is cited instead. Bring your own API key.
- [ ] Standalone HTML report to send to a client
- [ ] Localized issue messages (Italian first)
- [ ] Compare two runs: what got fixed, what is new
- [ ] `hreflang` and multi-language checks

## Development

```bash
pnpm install
pnpm test
pnpm run typecheck
pnpm run build
pnpm dev https://example.com
```

Tests run against an in-memory fake site, no network needed. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
