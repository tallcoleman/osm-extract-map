// Phase 0: one-off recording crawl of download.openstreetmap.fr.
//
// OSM-FR's robots.txt disallows all crawling. The project owner chose to crawl
// anyway with parameters matching manual exploration, so this keeps the load as low as possible:
// - 2s between requests (REQUEST_INTERVAL_MS to change), one at a time;
// - no retries: any error, 403, 429 or 5xx stops the whole crawl;
// - listings and .poly files only, never .pbf or diff files;
// - skips replication/{bbox,planet,merge}/ and never descends into
//   minute/hour/day directories;
// - entries recorded in the last 7 days are reused, so a stopped crawl
//   resumes without repeating requests.
//
// Usage: node updater/explore/osmfr-crawl.ts [--offline]
// --offline prints the report from the cache with no requests.

import { DEFAULT_CACHE_DIR, PROVIDER_HOSTS, USER_AGENT } from "../config.ts";
import { HttpClient } from "../http.ts";
import { type ListingEntry, parseListing } from "../listing.ts";

const BASE = "https://download.openstreetmap.fr";
const PREFIXES = ["/extracts/", "/polygons/", "/replication/"];
const INTERVALS = new Set(["minute", "hour", "day"]);
const SKIP_REPLICATION_TOP = new Set(["bbox", "planet", "merge"]);

const offline = process.argv.includes("--offline");
const logger = {
  info: (m: string) => console.log(m),
  warn: (m: string) => console.warn(m),
};
const http = new HttpClient({
  cacheDir: DEFAULT_CACHE_DIR,
  allowedHosts: PROVIDER_HOSTS,
  userAgent: USER_AGENT,
  mode: offline ? "offline" : "record",
  minIntervalMs: Number(process.env.REQUEST_INTERVAL_MS ?? 2000),
  maxRetries: 0,
  freshForMs: 7 * 24 * 3600 * 1000,
  logger,
});

let lastProgress = 0;
function progress(label: string) {
  const { requests } = http.getStats();
  if (requests - lastProgress >= 50) {
    lastProgress = requests;
    console.log(`[${new Date().toISOString()}] ${requests} requests so far (${label})`);
  }
}

async function list(url: string): Promise<ListingEntry[]> {
  const res = await http.get(url);
  if (res.status !== 200)
    throw new Error(`Stopping crawl: status ${res.status} for ${url}`);
  progress(url);
  return parseListing(res.body.toString("utf8"), url, PREFIXES, logger);
}

/** Walks a tree. Returns every entry, keyed by its path relative to `root`. */
async function walk(
  root: string,
  shouldDescend: (relPath: string) => boolean,
): Promise<Map<string, ListingEntry>> {
  const found = new Map<string, ListingEntry>();
  const queue: string[] = [""];
  while (queue.length > 0) {
    const rel = queue.shift()!;
    for (const entry of await list(`${BASE}${root}${rel}`)) {
      const entryRel = `${rel}${entry.name}${entry.isDir ? "/" : ""}`;
      found.set(entryRel, entry);
      if (entry.isDir && shouldDescend(entryRel)) queue.push(entryRel);
    }
  }
  return found;
}

function tally(items: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i] = (out[i] ?? 0) + 1;
  return out;
}

const extracts = await walk("/extracts/", () => true);
const polygons = await walk("/polygons/", () => true);
const replication = await walk("/replication/", (rel) => {
  const parts = rel.split("/").filter(Boolean);
  if (parts.length === 1 && SKIP_REPLICATION_TOP.has(parts[0]!)) return false;
  return !INTERVALS.has(parts.at(-1)!);
});

// Extract paths ("africa/algeria"), from "<path>.osm.pbf" (not "-latest").
const extractPaths = [...extracts.keys()]
  .filter((p) => p.endsWith(".osm.pbf") && !p.endsWith("-latest.osm.pbf"))
  .map((p) => p.slice(0, -".osm.pbf".length));
const isMerge = (p: string) => p.startsWith("merge/");
const regular = extractPaths.filter((p) => !isMerge(p));
const polyPaths = new Set(
  [...polygons.keys()]
    .filter((p) => p.endsWith(".poly"))
    .map((p) => p.slice(0, -".poly".length)),
);

// Fetch the .poly for every regular extract that has one.
let polyBytes = 0;
for (const p of regular) {
  if (!polyPaths.has(p)) continue;
  const res = await http.get(`${BASE}/polygons/${p}.poly`);
  if (res.status !== 200)
    throw new Error(`Stopping crawl: status ${res.status} for ${p}.poly`);
  polyBytes += res.body.length;
  progress(`${p}.poly`);
}

// Two sample interval directories, to confirm they hold state.txt.
const sampleIntervalDirs = [...replication.keys()]
  .filter((p) => /(^|\/)minute\/$/.test(p))
  .slice(0, 2);
const samples: Record<string, boolean> = {};
for (const d of sampleIntervalDirs) {
  const entries = await list(`${BASE}/replication/${d}`);
  samples[d] = entries.some((e) => e.name === "state.txt");
}

// Report
const intervalsFor = (p: string) =>
  [...INTERVALS].filter((i) => replication.has(`${p}/${i}/`));
const withReplication = regular.map((p) => ({ p, intervals: intervalsFor(p) }));
const pbfSize = (p: string) => extracts.get(`${p}.osm.pbf`)!;
const latestMismatch = regular.filter((p) => {
  const a = extracts.get(`${p}.osm.pbf`)!;
  const b = extracts.get(`${p}-latest.osm.pbf`);
  return !b || a.sizeText !== b.sizeText;
});
const depth = (p: string) => p.split("/").length - 1;
const dirsWithoutPbf = [...extracts.keys()]
  .filter((k) => k.endsWith("/") && !isMerge(k))
  .map((k) => k.slice(0, -1))
  .filter((d) => !extracts.has(`${d}.osm.pbf`));

console.log("\n## OSM-FR crawl report");
console.log(
  `extracts tree entries: ${extracts.size}, polygons: ${polygons.size}, replication: ${replication.size}`,
);
console.log(
  `extracts: ${extractPaths.length} (${regular.length} regular, ${extractPaths.length - regular.length} under merge/)`,
);
console.log("merge/ extracts:", extractPaths.filter(isMerge));
console.log(
  "file suffixes in extracts/:",
  tally(
    [...extracts.keys()]
      .filter((k) => !k.endsWith("/"))
      .map((k) => k.replace(/^.*?(-latest)?\.(.*)$/, "$1.$2")),
  ),
);
console.log("depth counts:", tally(regular.map((p) => String(depth(p)))));
console.log("directories with no extract of their own:", dirsWithoutPbf);
console.log("<name>-latest.osm.pbf missing or different size:", latestMismatch);
console.log(
  `regular extracts with a .poly: ${regular.filter((p) => polyPaths.has(p)).length}`,
);
console.log(
  "extracts without .poly:",
  regular.filter((p) => !polyPaths.has(p)),
);
console.log(
  "polygons without extract:",
  [...polyPaths].filter((p) => !extractPaths.includes(p)),
);
console.log(`.poly bytes: ${polyBytes}`);
console.log(
  "interval combinations:",
  tally(withReplication.map((r) => r.intervals.join("+") || "none")),
);
console.log(
  "no change files:",
  withReplication.filter((r) => r.intervals.length === 0).map((r) => r.p),
);
console.log(
  "no minutely:",
  withReplication
    .filter((r) => r.intervals.length > 0 && !r.intervals.includes("minute"))
    .map((r) => `${r.p} (${r.intervals.join("+")})`),
);
const extractSet = new Set(extractPaths);
console.log(
  "replication dirs with intervals but no extract:",
  [...replication.keys()]
    .filter((k) => INTERVALS.has(k.split("/").filter(Boolean).at(-1)!))
    .map((k) => k.split("/").filter(Boolean).slice(0, -1).join("/"))
    .filter((p, i, a) => a.indexOf(p) === i && !extractSet.has(p)),
);
console.log("sample interval dirs contain state.txt:", samples);
console.log(
  "size text samples:",
  regular.slice(0, 5).map((p) => `${p}: ${pbfSize(p).sizeText}`),
);
http.logSummary();
