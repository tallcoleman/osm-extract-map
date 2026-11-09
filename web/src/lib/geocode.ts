import type { BBox } from "./geo.ts";
import type { FetchFn } from "./load.ts";

/** Komoot's public Photon instance (OSM data, fair use). */
export const PHOTON_URL = "https://photon.komoot.io/api/";

/** Languages the public Photon instance accepts; others are rejected with HTTP 400. */
const PHOTON_LANGS = new Set(["en", "de", "fr"]);

export interface Place {
  label: string;
  /** Where it is, e.g. "Québec, Canada". May be empty. */
  detail: string;
  center: [lon: number, lat: number];
  /** Missing for addresses and other points. */
  bbox: BBox | null;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The `lang` value to send for a browser language, or null to get local names. */
export function photonLang(language: string | undefined): string | null {
  const base = language?.toLowerCase().split("-")[0];
  return base && PHOTON_LANGS.has(base) ? base : null;
}

/** Photon's extent is [west, north, east, south]. */
function extentBBox(extent: unknown): BBox | null {
  if (!Array.isArray(extent) || extent.length !== 4 || !extent.every(isNum)) return null;
  const [w, n, e, s] = extent as [number, number, number, number];
  return s <= n ? [w, s, e, n] : null;
}

export function toPlace(f: PhotonFeature): Place | null {
  const coords = f.geometry?.coordinates;
  if (!Array.isArray(coords) || !isNum(coords[0]) || !isNum(coords[1])) return null;
  const p = f.properties ?? {};
  const street = [str(p.street), str(p.housenumber)].filter(Boolean).join(" ");
  const label = str(p.name) || street;
  if (!label) return null;
  const parts: string[] = [];
  for (const v of [p.name ? street : "", str(p.city), str(p.state), str(p.country)]) {
    if (v && v !== label && !parts.includes(v)) parts.push(v);
  }
  return { label, detail: parts.join(", "), center: [coords[0], coords[1]], bbox: extentBBox(p.extent) };
}

export interface GeocodeOptions {
  fetchFn?: FetchFn;
  signal?: AbortSignal;
  /** Browser language, e.g. "fr-CA". */
  language?: string;
}

/** Up to five places matching the query. Rejects on network or HTTP errors, and when aborted. */
export async function geocode(query: string, { fetchFn = fetch, signal, language = navigator.language }: GeocodeOptions = {}): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: "5" });
  const lang = photonLang(language);
  if (lang) params.set("lang", lang);
  const res = await fetchFn(`${PHOTON_URL}?${params}`, { signal });
  if (!res.ok) throw new Error(`Place search: HTTP ${res.status}`);
  const body = (await res.json()) as { features?: unknown };
  const features = Array.isArray(body.features) ? (body.features as PhotonFeature[]) : [];
  return features.map(toPlace).filter((p): p is Place => p !== null);
}
