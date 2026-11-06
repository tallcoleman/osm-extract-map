// OpenStreetMap France: extracts from nginx directory listings.
//
// OSM-FR's robots.txt disallows all crawling; the project owner chose to
// crawl with minimal requests (see docs/implementation-plan.md). So this:
// - lists only directories that matter: extracts/ (minus merge/), and the
//   matching polygons/ and replication/ directories;
// - never enters minute/hour/day directories (their presence is enough);
// - re-fetches a .poly only when its listing date is newer than the cached copy.

import type { BoundaryGeometry, ReplicationInterval } from "../../shared/schema.ts";
import { REPLICATION_INTERVALS } from "../../shared/schema.ts";
import { type HttpClient, HttpError, type Logger } from "../http.ts";
import { type ListingEntry, parseListing } from "../listing.ts";
import { parsePoly } from "../poly.ts";
import type { ExtractDraft, ProviderData } from "./types.ts";

export const OSMFR_BASE = "https://download.openstreetmap.fr";
const PREFIXES = ["/extracts/", "/polygons/", "/replication/"];
/** Pre-merged extracts, outside the regional hierarchy. */
const MERGE_DIR = "merge";
const PBF_SUFFIX = ".osm.pbf";
const LATEST_SUFFIX = "-latest.osm.pbf";
const POLY_SUFFIX = ".poly";

export interface OsmfrOptions {
  /** Extract paths to leave out, with everything under them. */
  exclude?: readonly string[];
  logger: Logger;
}

// Directory names are lower case ASCII with "_" or "-" between words, so
// accents can't be recovered ("cote_d_or" becomes "Cote d'Or", not "Côte-d'Or").
const SMALL_WORDS = new Set(["and", "of", "the", "de", "du", "des", "del", "la", "le", "les", "et", "y", "da", "do", "og"]);
const ELIDED = new Set(["d", "l", "o"]);
const ACRONYMS = new Set(["us", "usa", "taaf"]);

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Display name from a directory name: "nord_du_quebec" → "Nord du Quebec", "cote_d_or" → "Cote d'Or". */
export function displayName(segment: string): string {
  const words = segment.split(/[_-]+/).filter(Boolean);
  // "d", "l" or "o" before another word is elided: "d'Or", "O'Higgins".
  const elides = (i: number) => ELIDED.has(words[i]!) && i < words.length - 1;
  const parts = words.map((word, i) => {
    if (ACRONYMS.has(word)) return word.toUpperCase();
    if (i > 0 && (SMALL_WORDS.has(word) || elides(i))) return word;
    return capitalize(word);
  });
  return parts.map((part, i) => (i === 0 ? part : (elides(i - 1) ? "'" : " ") + part)).join("");
}

interface Listed {
  url: string;
  entries: ListingEntry[];
  fetchedAt: number;
}

async function list(http: HttpClient, url: string, logger: Logger): Promise<Listed> {
  const res = await http.get(url);
  if (res.status !== 200) throw new HttpError("bad-status", url, `Expected 200, got ${res.status}`, res.status);
  return { url, entries: parseListing(res.body.toString("utf8"), url, PREFIXES, logger), fetchedAt: res.fetchedAt };
}

/** Lists `root` and then each subdirectory `descend` accepts, breadth first. Keys are relative paths ("" = root). */
async function walk(
  http: HttpClient,
  root: string,
  descend: (rel: string) => boolean,
  logger: Logger,
): Promise<Map<string, Listed>> {
  const listings = new Map<string, Listed>();
  const queue = [""];
  while (queue.length > 0) {
    const rel = queue.shift()!;
    const listed = await list(http, `${OSMFR_BASE}${root}${rel === "" ? "" : `${rel}/`}`, logger);
    listings.set(rel, listed);
    for (const e of listed.entries) {
      const child = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDir && descend(child)) queue.push(child);
    }
  }
  return listings;
}

const parentPath = (p: string): string | null => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : null);

export async function fetchOsmfr(http: HttpClient, options: OsmfrOptions): Promise<ProviderData> {
  const { logger } = options;
  const exclude = options.exclude ?? [];
  const excluded = (p: string) => p === MERGE_DIR || exclude.some((e) => p === e || p.startsWith(`${e}/`));

  // 1. extracts/: every <name>.osm.pbf (the -latest copy is the same file).
  const extractListings = await walk(http, "/extracts/", (rel) => !excluded(rel), logger);
  const dirs = new Set(extractListings.keys());
  const pbfs = new Map<string, { entry: ListingEntry; listing: Listed }>();
  for (const [rel, listing] of extractListings) {
    for (const e of listing.entries) {
      if (e.isDir || !e.name.endsWith(PBF_SUFFIX) || e.name.endsWith(LATEST_SUFFIX)) continue;
      const p = (rel === "" ? "" : `${rel}/`) + e.name.slice(0, -PBF_SUFFIX.length);
      if (!excluded(p)) pbfs.set(p, { entry: e, listing });
    }
  }

  // 2. polygons/: only directories that exist under extracts/.
  const polyListings = await walk(http, "/polygons/", (rel) => dirs.has(rel), logger);
  const polys = new Map<string, ListingEntry>();
  for (const [rel, listing] of polyListings) {
    for (const e of listing.entries) {
      if (e.isDir || !e.name.endsWith(POLY_SUFFIX)) continue;
      polys.set((rel === "" ? "" : `${rel}/`) + e.name.slice(0, -POLY_SUFFIX.length), e);
    }
  }

  // 3. replication/: one directory per extract, plus the directories above them.
  const replListings = await walk(http, "/replication/", (rel) => dirs.has(rel) || pbfs.has(rel), logger);
  const intervals = new Map<string, { list: ReplicationInterval[]; url: string }>();
  for (const [rel, listing] of replListings) {
    const found = REPLICATION_INTERVALS.filter((i) => listing.entries.some((e) => e.isDir && e.name === i));
    const first = listing.entries.find((e) => e.isDir && e.name === found[0]);
    if (first) intervals.set(rel, { list: found, url: first.url });
  }

  // 4. Polygons. An extract without a usable .poly is skipped and logged.
  const geometries = new Map<string, BoundaryGeometry>();
  const noPoly: string[] = [];
  const badPoly: string[] = [];
  for (const p of [...pbfs.keys()].sort()) {
    const polyEntry = polys.get(p);
    if (!polyEntry) {
      noPoly.push(p);
      continue;
    }
    const modified = polyEntry.modifiedAt === null ? undefined : Date.parse(polyEntry.modifiedAt);
    const res = await http.get(polyEntry.url, { reuseIfNotModifiedSince: modified });
    if (res.status !== 200) {
      throw new HttpError("bad-status", polyEntry.url, `Expected 200, got ${res.status}`, res.status);
    }
    try {
      geometries.set(`osmfr:${p}`, parsePoly(res.body.toString("utf8"), polyEntry.url));
    } catch (error) {
      logger.warn(`OSM-FR: skipped ${p}: ${(error as Error).message}`);
      badPoly.push(p);
    }
  }

  // 5. Records. The parent is the nearest ancestor that has an extract of its
  // own (africa/spain/ has none, so africa/spain/ceuta's parent is africa).
  const kept = (p: string) => geometries.has(`osmfr:${p}`);
  const extracts: ExtractDraft[] = [];
  for (const p of [...pbfs.keys()].sort().filter(kept)) {
    const { entry, listing } = pbfs.get(p)!;
    let parent = parentPath(p);
    while (parent !== null && !kept(parent)) parent = parentPath(parent);
    const repl = intervals.get(p);
    extracts.push({
      key: `osmfr:${p}`,
      provider: "osmfr",
      id: p,
      name: displayName(p.slice(p.lastIndexOf("/") + 1)),
      parentKey: parent === null ? null : `osmfr:${parent}`,
      sizeBytes: entry.sizeBytes,
      sizeCheckedAt: new Date(listing.fetchedAt).toISOString(),
      urls: { page: listing.url, pbf: entry.url, poly: polys.get(p)!.url, replication: repl?.url ?? null },
      replication: { available: repl !== undefined, intervals: repl?.list ?? [] },
    });
  }

  const unmatched = [...polys.keys()].filter((p) => !pbfs.has(p) && !excluded(p));
  if (noPoly.length > 0) logger.warn(`OSM-FR: ${noPoly.length} extracts have no .poly: ${noPoly.join(", ")}`);
  if (unmatched.length > 0) logger.warn(`OSM-FR: ${unmatched.length} polygons have no extract: ${unmatched.join(", ")}`);
  if (badPoly.length > 0) logger.warn(`OSM-FR: ${badPoly.length} extracts skipped for a bad .poly`);
  logger.info(`OSM-FR: ${extracts.length} extracts`);
  return { extracts, geometries, fetchedAt: new Date(extractListings.get("")!.fetchedAt).toISOString() };
}
