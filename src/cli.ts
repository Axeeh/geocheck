#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { runAudit, UnreachableError } from "./audit.js";
import { formatMarkdown } from "./report/markdown.js";
import { formatText } from "./report/text.js";
import type { AuditResult, Severity } from "./types.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

/** Exit codes: 0 done, 1 a --fail-on or --min-score threshold was hit, 2 site unreachable, 3 usage error. */
const EXIT = { ok: 0, threshold: 1, unreachable: 2, usage: 3 } as const;

const HELP = `geocheck ${version}
How findable is a website on Google and in AI answer engines?

Usage
  geocheck <url> [options]

Options
  --format <text|md|json>   Output format (default: text)
  -o, --output <file>       Write the report to a file; a short summary still prints
  --max-pages <n>           Pages to parse (default: 30)
  --max-check <n>           Sitemap URLs to status-check (default: 200)
  --phone-prefix <+cc>      Country prefix for local phone numbers, e.g. +39
  --fail-on <level>         Exit 1 if an issue at this severity or above exists:
                            high, medium, low (default: never)
  --min-score <n>           Exit 1 if the overall score is below n
  --pagespeed               Add PageSpeed Insights mobile scores for the home page
                            (uses PAGESPEED_API_KEY from the environment if set)
  --timeout <ms>            Per-request timeout (default: 15000)
  --quiet                   No progress messages
  -h, --help                Show this help
  -v, --version             Show the version

Examples
  geocheck example.com
  geocheck http://localhost:4321 --max-pages 50
  geocheck https://example.com --format md -o report.md --fail-on high
`;

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1, info: 0 };

function normalizeUrl(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `${/^(localhost|127\.)/.test(input) ? "http" : "https"}://${input}`;
  return new URL(withScheme).href;
}

function positiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${name} must be a positive integer, got "${value}"`);
  return n;
}

function render(result: AuditResult, format: string, color: boolean): string {
  if (format === "json") return JSON.stringify(result, null, 2);
  if (format === "md") return formatMarkdown(result);
  return formatText(result, { color });
}

export async function main(argv: string[]): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: "string", default: "text" },
        output: { type: "string", short: "o" },
        "max-pages": { type: "string" },
        "max-check": { type: "string" },
        "phone-prefix": { type: "string" },
        "fail-on": { type: "string", default: "never" },
        "min-score": { type: "string" },
        pagespeed: { type: "boolean", default: false },
        timeout: { type: "string" },
        quiet: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\nRun geocheck --help for usage.\n`);
    return EXIT.usage;
  }
  const { values: v, positionals } = args;
  if (v.help) {
    process.stdout.write(HELP);
    return EXIT.ok;
  }
  if (v.version) {
    process.stdout.write(`${version}\n`);
    return EXIT.ok;
  }

  let url: string;
  let maxPages: number, maxCheck: number, timeoutMs: number;
  let minScore: number | undefined;
  try {
    if (positionals.length !== 1) throw new Error("Pass exactly one URL.");
    url = normalizeUrl(positionals[0]);
    if (!["text", "md", "json"].includes(v.format!)) throw new Error(`--format must be text, md or json, got "${v.format}"`);
    if (!["never", "high", "medium", "low"].includes(v["fail-on"]!)) throw new Error(`--fail-on must be high, medium, low or never, got "${v["fail-on"]}"`);
    if (v["phone-prefix"] && !/^\+\d{1,4}$/.test(v["phone-prefix"])) throw new Error(`--phone-prefix must look like +39, got "${v["phone-prefix"]}"`);
    maxPages = positiveInt("max-pages", v["max-pages"], 30);
    maxCheck = positiveInt("max-check", v["max-check"], 200);
    timeoutMs = positiveInt("timeout", v.timeout, 15000);
    if (v["min-score"] !== undefined) {
      minScore = Number(v["min-score"]);
      if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) throw new Error(`--min-score must be between 0 and 100, got "${v["min-score"]}"`);
    }
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\nRun geocheck --help for usage.\n`);
    return EXIT.usage;
  }

  const interactive = Boolean(process.stderr.isTTY) && !v.quiet;
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  let result: AuditResult;
  try {
    result = await runAudit({
      url,
      maxPages,
      maxCheck,
      timeoutMs,
      phonePrefix: v["phone-prefix"],
      pageSpeed: v.pagespeed,
      pageSpeedKey: process.env.PAGESPEED_API_KEY,
      onProgress: interactive ? (m) => process.stderr.write(`\x1b[2K\r  checking ${m.slice(0, 90)}`) : undefined,
    });
  } catch (e) {
    if (interactive) process.stderr.write("\x1b[2K\r");
    if (e instanceof UnreachableError) {
      process.stderr.write(`${e.message}\n`);
      return EXIT.unreachable;
    }
    throw e;
  }
  if (interactive) process.stderr.write("\x1b[2K\r");

  if (v.output) {
    writeFileSync(v.output, render(result, v.format!, false) + "\n");
    process.stdout.write(formatText(result, { color, limit: 5 }) + `\n\nReport written to ${v.output}\n`);
  } else {
    process.stdout.write(render(result, v.format!, color) + "\n");
  }

  const failOn = v["fail-on"] as Severity | "never";
  if (failOn !== "never" && result.issues.some((i) => SEVERITY_RANK[i.severity] >= SEVERITY_RANK[failOn])) return EXIT.threshold;
  if (minScore !== undefined && result.score.overall < minScore) return EXIT.threshold;
  return EXIT.ok;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`geocheck crashed: ${(e as Error).stack ?? e}\n`);
    process.exitCode = 70;
  },
);
