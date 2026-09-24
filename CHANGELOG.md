# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0]

### Added

- `geocheck <url>` CLI with text, Markdown and JSON output.
- Crawl checks: redirects, duplicate host, robots.txt, sitemap and sitemap
  indexes, status of every sitemap URL, `noindex` pages in the sitemap.
- On-page checks: title, description, canonical, viewport, `lang`, H1, image
  `alt`, Open Graph image, thin pages, broken JSON-LD, duplicates.
- AI readiness checks: robots.txt rules for 10 AI crawlers (search and
  training kept apart), JavaScript-only content, business entity in JSON-LD,
  split entities, question headings, answer blocks, `llms.txt`.
- Local checks: click-to-call links, phone mismatch with `--phone-prefix`.
- Explainable 0-100 score per category and overall.
- `--fail-on` and `--min-score` for CI, and a GitHub Action.
- Optional PageSpeed Insights mobile scores with `--pagespeed`.
- Works on `localhost` dev servers, mapping the sitemap to local paths.
- When the home page redirects to another host (apex to www), the final host
  is audited, so its own canonical and sitemap are not flagged as foreign.
- Sitemap URLs that redirect to a page already audited are not counted twice.
