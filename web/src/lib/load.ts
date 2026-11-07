import {
  type BoundaryCollection,
  type Extract,
  type GapCollection,
  type Meta,
  META_FILE,
  PROVIDER_IDS,
  type ProviderId,
  SCHEMA_VERSION,
} from "../../../shared/schema.ts";

export type FetchFn = (url: string) => Promise<Response>;

export interface AppData {
  meta: Meta;
  extracts: Extract[];
  boundaries: Partial<Record<ProviderId, BoundaryCollection>>;
  /** Providers listed in meta.json whose boundaries failed to load. */
  failed: ProviderId[];
}

// Data files are plain names in the release directory.
const FILE_NAME = /^[\w.-]+$/;

async function getJson<T>(fetchFn: FetchFn, url: string): Promise<T> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

function dataUrl(base: string, file: string): string {
  if (!FILE_NAME.test(file) || file.startsWith(".")) throw new Error(`Unexpected data file name: ${file}`);
  return base + file;
}

/**
 * Loads meta.json, then the extract list and each provider's boundaries in
 * parallel. A provider whose boundaries fail is listed in `failed` and left
 * out; anything else that fails rejects.
 */
export async function loadData(fetchFn: FetchFn = fetch, base = "/data/"): Promise<AppData> {
  const meta = await getJson<Meta>(fetchFn, base + META_FILE);
  if (meta.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`Data format version ${meta.schemaVersion} isn't supported (expected ${SCHEMA_VERSION})`);
  }
  const providers = PROVIDER_IDS.filter((p) => meta.files.boundaries[p]);
  const [extracts, ...results] = await Promise.all([
    getJson<Extract[]>(fetchFn, dataUrl(base, meta.files.extracts)),
    ...providers.map((p) =>
      getJson<BoundaryCollection>(fetchFn, dataUrl(base, meta.files.boundaries[p]!)).then(
        (fc) => ({ p, fc }),
        () => ({ p, fc: null }),
      ),
    ),
  ]);
  const boundaries: AppData["boundaries"] = {};
  const failed: ProviderId[] = [];
  for (const { p, fc } of results) {
    if (fc) boundaries[p] = fc;
    else failed.push(p);
  }
  // Extracts with no boundaries can't be drawn, so they're left out of the list too.
  return { meta, extracts: extracts.filter((e) => boundaries[e.provider]), boundaries, failed };
}

/**
 * Loads the coverage gaps, if the release has them. Never rejects: without
 * them the map just has no hatching.
 */
export async function loadGaps(meta: Meta, fetchFn: FetchFn = fetch, base = "/data/"): Promise<GapCollection | null> {
  if (!meta.files.gaps) return null;
  try {
    return await getJson<GapCollection>(fetchFn, dataUrl(base, meta.files.gaps));
  } catch {
    return null;
  }
}

/** Used when config.json has no MapTiler key (development). */
export const FALLBACK_STYLE = "https://demotiles.maplibre.org/style.json";

export function maptilerStyle(key: string): string {
  return `https://api.maptiler.com/maps/dataviz/style.json?key=${encodeURIComponent(key)}`;
}

/** Basemap style URL from the runtime config.json, or the keyless fallback. */
export async function loadStyleUrl(fetchFn: FetchFn = fetch): Promise<string> {
  try {
    const config = await getJson<{ maptilerKey?: unknown }>(fetchFn, "/config.json");
    if (typeof config.maptilerKey === "string" && config.maptilerKey) return maptilerStyle(config.maptilerKey);
  } catch {
    // No config.json: use the fallback.
  }
  return FALLBACK_STYLE;
}
