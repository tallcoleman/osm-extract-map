// Coverage gaps: land where no extract is drawn, for each set of providers and
// each level. The map hatches them so missing coverage is visible.
//
// Land comes from Natural Earth's 1:50m land polygons (public domain), kept in
// updater/data/. Boundaries are snapped to a 0.001° grid (about 100 m) before
// the polygon operations: polyclip-ts fails on some of OSM-FR's detailed
// outlines otherwise, and the hatching doesn't need more precision.

import { readFile } from "node:fs/promises";
import path from "node:path";
import * as clip from "polyclip-ts";
import { LEVEL_VALUES, levelClass } from "../shared/levels.ts";
import {
  type BoundaryCollection,
  type BoundaryGeometry,
  type GapCollection,
  type GapFeature,
  PROVIDER_IDS,
  type ProviderId,
  providerSetKey,
} from "../shared/schema.ts";

type Pair = [number, number];
type Polygon = Pair[][];
export type MultiPolygon = Polygon[];

export const LAND_FILE = path.join(import.meta.dirname, "data", "ne_50m_land.geojson");
/** Grid the input is snapped to, in steps per degree. */
const SNAP = 1000;
/** Output precision, in steps per degree. */
const OUTPUT = 10000;
/** Smaller pieces are dropped: mostly slivers where the land and extract outlines differ along coasts. */
export const MIN_GAP_KM2 = 10;

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Area of a ring on a sphere, in km² (the formula used by d3 and turf). */
export function ringAreaKm2(ring: readonly Pair[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    sum += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
  }
  return Math.abs((sum * EARTH_RADIUS_KM ** 2) / 2);
}

export function polygonAreaKm2(polygon: Polygon): number {
  const [outer, ...holes] = polygon;
  return ringAreaKm2(outer!) - holes.reduce((sum, r) => sum + ringAreaKm2(r), 0);
}

function snapRing(ring: readonly number[][], steps: number): Pair[] {
  const out: Pair[] = [];
  for (const [x, y] of ring) {
    const p: Pair = [Math.round(x! * steps) / steps, Math.round(y! * steps) / steps];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/** Snaps every ring to the grid and drops rings that collapse, and polygons whose outer ring does. */
export function snapGeometry(geometry: BoundaryGeometry, steps = SNAP): MultiPolygon {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const out: MultiPolygon = [];
  for (const polygon of polygons) {
    const rings = polygon.map((r) => snapRing(r, steps));
    if (rings[0]!.length < 4) continue;
    out.push(rings.filter((r) => r.length >= 4));
  }
  return out;
}

/** Reads the land polygons, snapped like the boundaries. */
export async function loadLand(file = LAND_FILE): Promise<MultiPolygon> {
  const fc = JSON.parse(await readFile(file, "utf8")) as { features: { geometry: BoundaryGeometry }[] };
  return fc.features.flatMap((f) => snapGeometry(f.geometry));
}

function uncovered(land: MultiPolygon, covered: MultiPolygon[]): MultiPolygon {
  const shapes = covered.filter((g) => g.length > 0);
  if (shapes.length === 0) return land;
  const [first, ...rest] = shapes;
  return clip.difference(land, clip.union(first!, ...rest)) as MultiPolygon;
}

function overlap(gaps: MultiPolygon[]): MultiPolygon {
  if (gaps.some((g) => g.length === 0)) return [];
  const [first, ...rest] = gaps;
  return clip.intersection(first!, ...rest) as MultiPolygon;
}

function toFeature(providers: string, level: GapFeature["properties"]["level"], gap: MultiPolygon): GapFeature {
  const coordinates = gap
    .filter((polygon) => polygonAreaKm2(polygon) >= MIN_GAP_KM2)
    .map((polygon) => polygon.map((r) => snapRing(r, OUTPUT)));
  return { type: "Feature", properties: { providers, level }, geometry: { type: "MultiPolygon", coordinates } };
}

/**
 * One feature per set of providers ("geofabrik", "osmfr", "geofabrik+osmfr")
 * and level, holding the land where none of those providers' extracts is drawn
 * at that level. Only providers with boundaries are included.
 */
export function computeGaps(boundaries: Partial<Record<ProviderId, BoundaryCollection>>, land: MultiPolygon): GapCollection {
  const available = PROVIDER_IDS.filter((p) => boundaries[p]);
  const features: GapFeature[] = [];
  const byProvider = new Map<ProviderId, MultiPolygon[]>();
  for (const p of available) {
    const shapes = boundaries[p]!.features.map((f) => ({ props: f.properties, geometry: snapGeometry(f.geometry) }));
    const gaps = LEVEL_VALUES.map((level) =>
      uncovered(
        land,
        shapes.filter((s) => levelClass(s.props, level)).map((s) => s.geometry),
      ),
    );
    byProvider.set(p, gaps);
    LEVEL_VALUES.forEach((level, i) => features.push(toFeature(providerSetKey([p]), level, gaps[i]!)));
  }
  if (available.length > 1) {
    LEVEL_VALUES.forEach((level, i) => {
      features.push(toFeature(providerSetKey(available), level, overlap(available.map((p) => byProvider.get(p)![i]!))));
    });
  }
  return { type: "FeatureCollection", features };
}
