import type { BoundaryCollection, BoundaryGeometry } from "../../../shared/schema.ts";

export type BBox = [west: number, south: number, east: number, north: number];

export function geometryBBox(g: BoundaryGeometry): BBox {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of polys)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x === undefined || y === undefined) continue;
        if (x < w) w = x;
        if (x > e) e = x;
        if (y < s) s = y;
        if (y > n) n = y;
      }
  return [w, s, e, n];
}

/** Bounding box per extract key, for zooming to an extract from the list. */
export function bboxIndex(collections: readonly BoundaryCollection[]): Map<string, BBox> {
  const out = new Map<string, BBox>();
  for (const fc of collections) for (const f of fc.features) out.set(f.properties.key, geometryBBox(f.geometry));
  return out;
}
