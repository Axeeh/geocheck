# Contributing

Thanks for helping. A report with the URL of a site where geocheck got
something wrong (a false alarm, or a problem it missed) is the most useful
contribution of all.

## Set up

```bash
git clone https://github.com/Axeeh/geocheck
cd geocheck
pnpm install
```

## Run the checks

```bash
pnpm run typecheck
pnpm test
pnpm run build
pnpm dev https://example.com   # run the CLI from source
```

Tests run against an in-memory fake site (`tests/helpers.ts`), so they need
no network and finish in under a second.

## Guidelines

- Checks are pure functions in `src/checks.ts`, from measured data to issues.
  Network access lives only in `src/fetch.ts` and `src/audit.ts`.
- An issue is a measurement: its message says what was seen and where. If
  something could not be measured (timeout, no answer), say so, never report
  it as missing.
- A new rule needs a stable id, a row in `docs/checks.md` and a test.
- Keep runtime dependencies at zero.
- Add a test for every bug fix.
- No em dashes in docs or messages.

## Releasing (maintainers)

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. Tag and push: `git tag v0.2.0 && git push --tags`, then move the `v0`
   tag used by the GitHub Action: `git tag -f v0 && git push -f origin v0`.
3. `pnpm publish` (runs typecheck, tests and build first).
