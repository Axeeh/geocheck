# geocheck

Open source CLI and TypeScript library: audits how findable a website is on
Google and in AI answer engines (technical SEO, local signals, AI readiness).
Generalized from the workspace skill `audit-seo-geo` (`scripts/audit.mjs`).
Public repository, so everything here (code, comments, docs, commit messages)
is in **English**.

Read `README.md` for the user view and `docs/checks.md` for every rule.

## Layout

- `src/fetch.ts`: fetch wrapper (status 0 = no answer) and manual redirect
  chains. `src/html.ts`: regex HTML reading, `parsePage`, `normPhone`.
  `src/robots.ts`: robots.txt groups and per-crawler verdicts.
  `src/sitemap.ts`: sitemaps and indexes. `src/checks.ts`: pure rules, data
  in, issues out. `src/score.ts`: the explainable score. `src/audit.ts`:
  `runAudit`, the only orchestrator. `src/report/`: text and Markdown.
  `src/cli.ts`: argument parsing and exit codes. `src/index.ts`: public API.
- `tests/`: vitest, against an in-memory fake site (`tests/helpers.ts`).
- `action.yml`: composite GitHub Action that runs the published package.

## Commands

```bash
pnpm install                      # virtual store in .pnpm-store.nosync (iCloud)
pnpm run typecheck && pnpm test
pnpm run build && node dist/cli.js https://example.com
```

Set `npm_config_store_dir="$TMPDIR/pnpm-store"` when the sandbox blocks the
global pnpm store. The Bash sandbox blocks DNS for Node: a real-site run exits
`2` with `ENOTFOUND` there, so run it outside the sandbox. That exit is the
tool working as designed, never "site down".

## Rules

- Zero runtime dependencies. Dev dependencies only.
- Checks stay pure functions; network only in `fetch.ts` and `audit.ts`.
- "Not measured" is never "missing": unreadable robots.txt is `unknown`, a
  home with no answer throws `UnreachableError` (exit 2).
- Every rule has a stable id, a row in `docs/checks.md` and a test.
- Never use client sites or client data in tests, fixtures, docs or the
  README: invent `example.com` sites.
- No em dashes in docs or messages.
- This folder is its **own git repository** (ignored by the workspace repo).
  The GitHub remote will be `github.com/Axeeh/geocheck`: create it, push, tag
  or publish to npm only when the maintainer asks.
