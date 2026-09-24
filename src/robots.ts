import type { BotKind, BotVerdict } from "./types.js";

/**
 * Crawlers that matter. "search" bots fetch pages to answer a user right now:
 * blocking them removes the site from that engine. "training" bots collect
 * data for model training: blocking them is a legitimate choice, not an error.
 */
export const BOTS: [string, BotKind][] = [
  ["Googlebot", "search"],
  ["Bingbot", "search"],
  ["OAI-SearchBot", "search"],
  ["ChatGPT-User", "search"],
  ["PerplexityBot", "search"],
  ["Claude-SearchBot", "search"],
  ["Claude-User", "search"],
  ["GPTBot", "training"],
  ["ClaudeBot", "training"],
  ["Google-Extended", "training"],
  ["CCBot", "training"],
  ["Applebot-Extended", "training"],
];

/** Classic search engines: blocking them is a crawl problem, not only an AI one. */
export const CLASSIC_SEARCH = new Set(["Googlebot", "Bingbot"]);

interface Group {
  agents: string[];
  rules: { type: "allow" | "disallow"; path: string }[];
}

export interface Robots {
  sitemaps: string[];
  groups: Group[];
  bots: BotVerdict[];
}

export function parseRobots(txt: string): Robots {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").trim();
    if (key === "user-agent") {
      // Consecutive user-agent lines share one group.
      if (!lastWasAgent || !cur) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === "sitemap") sitemaps.push(val);
      else if ((key === "allow" || key === "disallow") && cur) cur.rules.push({ type: key, path: val });
    }
  }

  const verdict = (bot: string): Pick<BotVerdict, "status" | "group"> => {
    const b = bot.toLowerCase();
    const g = groups.find((x) => x.agents.includes(b)) || groups.find((x) => x.agents.includes("*"));
    if (!g) return { status: "allowed", group: "no matching rules" };
    const root = g.rules.filter((r) => r.path === "/");
    const blockedRoot = root.some((r) => r.type === "disallow") && !root.some((r) => r.type === "allow");
    const partial = g.rules.some((r) => r.type === "disallow" && r.path && r.path !== "/");
    return { status: blockedRoot ? "blocked" : partial ? "partial" : "allowed", group: g.agents.join(", ") };
  };

  return { sitemaps, groups, bots: BOTS.map(([name, kind]) => ({ name, kind, ...verdict(name) })) };
}

/** Verdicts for a robots.txt that could not be read: the rules are unknown, not absent. */
export function unknownBots(): BotVerdict[] {
  return BOTS.map(([name, kind]) => ({ name, kind, status: "unknown", group: "robots.txt not read" }));
}
