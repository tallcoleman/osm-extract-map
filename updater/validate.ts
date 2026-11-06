// Checks run before a release is published. Provider data is untrusted.

import {
  type BoundaryGeometry,
  type Meta,
  type ProviderConfig,
  PROVIDERS,
  type ProviderId,
  SCHEMA_VERSION,
} from "../shared/schema.ts";
import { checkAllowedUrl, LINK_HOSTS } from "../shared/urls.ts";
import type { Logger } from "./http.ts";
import type { ExtractDraft, ProviderData } from "./providers/types.ts";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Largest share of extracts that may be lost, to bad URLs or since the previous release. */
export const MAX_LOSS = 0.1;

export interface Bbox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Bounding box of a geometry, or null if any position is malformed or the box is empty. */
export function geometryBbox(geometry: BoundaryGeometry): Bbox | null {
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return null;
  if (!Array.isArray(geometry.coordinates)) return null;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const box = { minLon: Infinity, minLat: Infinity, maxLon: -Infinity, maxLat: -Infinity };
  for (const polygon of polygons) {
    if (!Array.isArray(polygon)) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring)) return null;
      for (const pos of ring) {
        if (!Array.isArray(pos) || pos.length < 2) return null;
        const [lon, lat] = pos as [unknown, unknown];
        if (typeof lon !== "number" || typeof lat !== "number") return null;
        if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
        box.minLon = Math.min(box.minLon, lon);
        box.maxLon = Math.max(box.maxLon, lon);
        box.minLat = Math.min(box.minLat, lat);
        box.maxLat = Math.max(box.maxLat, lat);
      }
    }
  }
  return box.minLon < box.maxLon && box.minLat < box.maxLat ? box : null;
}

/** Names of the extract's URLs that aren't https on the provider's download host. */
export function badUrls(extract: ExtractDraft): string[] {
  const host = PROVIDERS[extract.provider].downloadHost;
  return Object.entries(extract.urls)
    .filter(([, url]) => url !== null && checkAllowedUrl(url, [host]) === null)
    .map(([name]) => name);
}

/**
 * Checks one freshly fetched provider. Extracts with bad URLs are dropped and
 * logged; anything else wrong throws a ValidationError. Returns the data that
 * passed.
 */
export function validateProvider(
  provider: ProviderId,
  data: ProviderData,
  previousCount: number | null,
  logger: Logger,
): ProviderData {
  const name = PROVIDERS[provider].name;

  const extracts = data.extracts.filter((e) => {
    if (e.provider !== provider || e.key !== `${provider}:${e.id}`) {
      throw new ValidationError(`${name}: extract "${e.key}" has the wrong provider or key`);
    }
    const bad = badUrls(e);
    if (bad.length > 0) logger.warn(`${name}: dropped ${e.key}, unsafe URLs: ${bad.join(", ")}`);
    return bad.length === 0;
  });
  const dropped = data.extracts.length - extracts.length;
  if (dropped > data.extracts.length * MAX_LOSS) {
    throw new ValidationError(`${name}: ${dropped} of ${data.extracts.length} extracts have unsafe URLs`);
  }

  if (extracts.length === 0) throw new ValidationError(`${name}: no extracts`);
  if (previousCount !== null && extracts.length < previousCount * (1 - MAX_LOSS)) {
    throw new ValidationError(`${name}: ${extracts.length} extracts, down from ${previousCount}`);
  }

  const keys = new Set<string>();
  for (const e of extracts) {
    if (keys.has(e.key)) throw new ValidationError(`${name}: duplicate key "${e.key}"`);
    keys.add(e.key);
  }
  const geometries = new Map<string, BoundaryGeometry>();
  for (const e of extracts) {
    const geometry = data.geometries.get(e.key);
    if (!geometry) throw new ValidationError(`${name}: ${e.key} has no geometry`);
    if (!geometryBbox(geometry)) throw new ValidationError(`${name}: ${e.key} has an invalid or empty geometry`);
    if (e.parentKey !== null && !keys.has(e.parentKey)) {
      throw new ValidationError(`${name}: parent "${e.parentKey}" of ${e.key} not found`);
    }
    geometries.set(e.key, geometry);
  }

  return { extracts, geometries, fetchedAt: data.fetchedAt };
}

/** Checks the release metadata and the static provider settings it links to. */
export function validateMeta(meta: Meta, providers: Record<ProviderId, ProviderConfig> = PROVIDERS): void {
  if (meta.schemaVersion !== SCHEMA_VERSION) {
    throw new ValidationError(`meta.json schema version ${meta.schemaVersion}, expected ${SCHEMA_VERSION}`);
  }
  for (const p of Object.values(providers)) {
    if (!checkAllowedUrl(p.homepage, LINK_HOSTS)) {
      throw new ValidationError(`${p.name} homepage ${p.homepage} is not https on an allowlisted host`);
    }
  }
  if (Object.keys(meta.providers).length === 0) throw new ValidationError("release has no providers");
}
