// Geofabrik: extracts and boundaries from index-v1.json, sizes from region pages.
//
// robots.txt disallows *.osm.pbf, state.txt and *updates*, so sizes come from
// the HTML pages (allowed) and replication files are never fetched.

import { type BoundaryGeometry, PROVIDERS } from "../../shared/schema.ts";
import { HttpError, type HttpClient, type Logger } from "../http.ts";
import { displayName } from "./osmfr.ts";
import { type ExtractDraft, type ProviderData, ProviderFormatError } from "./types.ts";

export const GEOFABRIK_INDEX_URL = "https://download.geofabrik.de/index-v1.json";
/** Lists sizes for the top-level extracts. */
export const GEOFABRIK_TOP_PAGE_URL = "https://download.geofabrik.de/index.html";

const PBF_SUFFIX = "-latest.osm.pbf";
const SIZE_UNITS: Record<string, number> = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
// A sub-region row: the .osm.pbf link cell, then a cell like "(1.2&nbsp;GB)".
const SIZE_ROW = /<a href="([^"]+-latest\.osm\.pbf)">\[\.osm\.pbf\]<\/a><\/td>\s*<td[^>]*>\(([\d.]+)&nbsp;([KMGT]B)\)<\/td>/g;

export interface GeofabrikOptions {
  skipSizes?: boolean;
  logger: Logger;
}

export interface IndexFeature {
  id: string;
  parent: string | null;
  name: string;
  pbf: string;
  updates: string | null;
  geometry: BoundaryGeometry;
}

const isString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function parseIndex(text: string): IndexFeature[] {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ProviderFormatError("Geofabrik index-v1.json is not valid JSON");
  }
  const features = (doc as { features?: unknown })?.features;
  if ((doc as { type?: unknown })?.type !== "FeatureCollection" || !Array.isArray(features)) {
    throw new ProviderFormatError("Geofabrik index-v1.json is not a FeatureCollection");
  }
  return features.map((f: unknown, i): IndexFeature => {
    const props = (f as { properties?: Record<string, unknown> })?.properties;
    const urls = props?.urls as Record<string, unknown> | undefined;
    const geometry = (f as { geometry?: { type?: unknown; coordinates?: unknown } })?.geometry;
    const where = `Geofabrik feature ${i}${isString(props?.id) ? ` (${props.id})` : ""}`;
    if (!props || !isString(props.id) || !isString(props.name)) throw new ProviderFormatError(`${where} has no id or name`);
    if (props.parent !== undefined && !isString(props.parent)) throw new ProviderFormatError(`${where} has a bad parent`);
    if (!urls || !isString(urls.pbf)) throw new ProviderFormatError(`${where} has no urls.pbf`);
    if (urls.updates !== undefined && !isString(urls.updates)) throw new ProviderFormatError(`${where} has a bad urls.updates`);
    if (
      !geometry ||
      (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") ||
      !Array.isArray(geometry.coordinates)
    ) {
      throw new ProviderFormatError(`${where} has no Polygon or MultiPolygon geometry`);
    }
    return {
      id: props.id,
      parent: props.parent ?? null,
      name: props.name,
      pbf: urls.pbf,
      updates: urls.updates ?? null,
      geometry: geometry as BoundaryGeometry,
    };
  });
}

/** Parses the sizes listed next to each sub-region's .osm.pbf link. Keys are absolute .pbf URLs. */
export function parseSizePage(html: string, pageUrl: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const m of html.matchAll(SIZE_ROW)) {
    const url = new URL(m[1]!, pageUrl).href;
    sizes.set(url, Math.round(Number(m[2]) * SIZE_UNITS[m[3]!]!));
  }
  return sizes;
}

/**
 * Fixes two quirks of index-v1.json, both seen on US states:
 * - "us/alabama" has parent "north-america" (beside "us", not under it), while
 *   Geofabrik's own us.html lists the states. An id "<prefix>/<name>" whose
 *   prefix is a sibling extract is moved under that prefix.
 * - Most states have the id as their name ("us/alabama"). A name equal to the
 *   id is replaced with one derived from its last segment ("Alabama").
 */
export function tidyIndex(features: IndexFeature[]): IndexFeature[] {
  const parentOf = new Map(features.map((f) => [f.id, f.parent]));
  return features.map((f) => {
    const slash = f.id.lastIndexOf("/");
    const prefix = f.id.slice(0, slash);
    const parent = slash > 0 && parentOf.has(prefix) && parentOf.get(prefix) === f.parent ? prefix : f.parent;
    const name = f.name === f.id ? displayName(f.id.slice(slash + 1)) : f.name;
    return { ...f, parent, name };
  });
}

/** The .pbf URL with "-latest.osm.pbf" replaced, or null if it doesn't end that way. */
function sibling(pbf: string, suffix: string): string | null {
  return pbf.endsWith(PBF_SUFFIX) ? pbf.slice(0, -PBF_SUFFIX.length) + suffix : null;
}

async function fetchSizes(
  http: HttpClient,
  pages: string[],
  logger: Logger,
): Promise<Map<string, { bytes: number; checkedAt: string }>> {
  const sizes = new Map<string, { bytes: number; checkedAt: string }>();
  for (const page of pages) {
    let html: string;
    let fetchedAt: number;
    try {
      const res = await http.get(page);
      if (res.status !== 200) throw new HttpError("bad-status", page, `Expected 200, got ${res.status}`, res.status);
      html = res.body.toString("utf8");
      fetchedAt = res.fetchedAt;
    } catch (error) {
      logger.warn(`Geofabrik: no sizes from ${page} (${(error as Error).message})`);
      continue;
    }
    const found = parseSizePage(html, page);
    if (found.size === 0) logger.warn(`Geofabrik: no sizes found in ${page}; has the page format changed?`);
    const checkedAt = new Date(fetchedAt).toISOString();
    for (const [url, bytes] of found) sizes.set(url, { bytes, checkedAt });
  }
  return sizes;
}

export async function fetchGeofabrik(http: HttpClient, options: GeofabrikOptions): Promise<ProviderData> {
  const { logger } = options;
  const res = await http.get(GEOFABRIK_INDEX_URL);
  if (res.status !== 200) throw new HttpError("bad-status", GEOFABRIK_INDEX_URL, `Expected 200, got ${res.status}`, res.status);
  const features = tidyIndex(parseIndex(res.body.toString("utf8")));

  const ids = new Set<string>();
  for (const f of features) {
    if (ids.has(f.id)) throw new ProviderFormatError(`Geofabrik id "${f.id}" appears twice`);
    ids.add(f.id);
  }

  let sizes = new Map<string, { bytes: number; checkedAt: string }>();
  if (!options.skipSizes) {
    const parents = new Set(features.map((f) => f.parent).filter((p) => p !== null));
    const pages = [
      GEOFABRIK_TOP_PAGE_URL,
      ...features.filter((f) => parents.has(f.id)).flatMap((f) => sibling(f.pbf, ".html") ?? []),
    ];
    sizes = await fetchSizes(http, pages, logger);
  }

  const extracts: ExtractDraft[] = [];
  const geometries = new Map<string, BoundaryGeometry>();
  const missingSizes: string[] = [];
  for (const f of features) {
    const key = `geofabrik:${f.id}`;
    const size = sizes.get(f.pbf);
    if (!options.skipSizes && !size) missingSizes.push(f.id);
    extracts.push({
      key,
      provider: "geofabrik",
      id: f.id,
      name: f.name,
      parentKey: f.parent === null ? null : `geofabrik:${f.parent}`,
      sizeBytes: size?.bytes ?? null,
      sizeCheckedAt: size?.checkedAt ?? null,
      urls: {
        page: sibling(f.pbf, ".html"),
        pbf: f.pbf,
        poly: sibling(f.pbf, ".poly"),
        replication: f.updates,
      },
      replication: {
        available: f.updates !== null,
        // The updates URL doesn't name an interval; Geofabrik updates every extract daily.
        intervals: f.updates !== null ? [PROVIDERS.geofabrik.expectedInterval] : [],
      },
    });
    geometries.set(key, f.geometry);
  }
  if (missingSizes.length > 0) {
    logger.warn(`Geofabrik: no size for ${missingSizes.length} extracts: ${missingSizes.slice(0, 20).join(", ")}`);
  }
  logger.info(`Geofabrik: ${extracts.length} extracts`);
  return { extracts, geometries, fetchedAt: new Date(res.fetchedAt).toISOString() };
}
