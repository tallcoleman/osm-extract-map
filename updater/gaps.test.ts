import { describe, expect, it } from "vitest";
import type { BoundaryCollection, BoundaryGeometry, GapCollection } from "../shared/schema.ts";
import { computeGaps, LAND_FILE, loadLand, type MultiPolygon, polygonAreaKm2, ringAreaKm2, snapGeometry } from "./gaps.ts";

type Pair = [number, number];
const box = (w: number, s: number, e: number, n: number): Pair[] => [
  [w, s],
  [e, s],
  [e, n],
  [w, n],
  [w, s],
];
const square = (w: number, s: number, e: number, n: number): BoundaryGeometry => ({ type: "Polygon", coordinates: [box(w, s, e, n)] });

function collection(features: { key: string; depth: number; isLeaf: boolean; isBundle?: boolean; geometry: BoundaryGeometry }[]): BoundaryCollection {
  return {
    type: "FeatureCollection",
    features: features.map((f) => ({
      type: "Feature",
      properties: { key: f.key, depth: f.depth, isLeaf: f.isLeaf, isBundle: f.isBundle ?? false, name: f.key },
      geometry: f.geometry,
    })),
  };
}

// Land: a 10° square, plus a tiny island (about 1 km²) that nobody covers.
const LAND: MultiPolygon = [[box(0, 0, 10, 10)], [box(20, 20, 20.01, 20.01)]];

// Geofabrik: a parent over all the land, with one child over the west half,
// and a bundle over everything, which never counts.
const geofabrik = collection([
  { key: "geofabrik:p", depth: 0, isLeaf: false, geometry: square(0, 0, 10, 10) },
  { key: "geofabrik:c", depth: 1, isLeaf: true, geometry: square(0, 0, 5, 10) },
  { key: "geofabrik:bundle", depth: 0, isLeaf: true, isBundle: true, geometry: square(-1, -1, 11, 11) },
]);
// OSM-FR: one leaf over the east 3°.
const osmfr = collection([{ key: "osmfr:e", depth: 0, isLeaf: true, geometry: square(7, 0, 10, 10) }]);

const area = (gaps: GapCollection, providers: string, level: string | number) => {
  const f = gaps.features.find((g) => g.properties.providers === providers && g.properties.level === level)!;
  return f.geometry.coordinates.reduce((sum, p) => sum + polygonAreaKm2(p as Pair[][]), 0);
};
const areaOf = (w: number, s: number, e: number, n: number) => ringAreaKm2(box(w, s, e, n));
const close = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(expected * 1e-6 + 1e-6);

describe("computeGaps", () => {
  const gaps = computeGaps({ geofabrik, osmfr }, LAND);

  it("has a feature per provider set and level", () => {
    expect(gaps.features.map((f) => `${f.properties.providers} ${f.properties.level}`)).toEqual([
      "geofabrik smallest",
      "geofabrik 0",
      "geofabrik 1",
      "geofabrik 2",
      "geofabrik 3",
      "osmfr smallest",
      "osmfr 0",
      "osmfr 1",
      "osmfr 2",
      "osmfr 3",
      "geofabrik+osmfr smallest",
      "geofabrik+osmfr 0",
      "geofabrik+osmfr 1",
      "geofabrik+osmfr 2",
      "geofabrik+osmfr 3",
    ]);
    expect(gaps.features.every((f) => f.geometry.type === "MultiPolygon")).toBe(true);
  });

  it("leaves out land covered by what each level draws", () => {
    // Smallest and depth 1 draw only the child; depth 0 draws the parent.
    close(area(gaps, "geofabrik", "smallest"), areaOf(5, 0, 10, 10));
    close(area(gaps, "geofabrik", 0), 0);
    close(area(gaps, "geofabrik", 1), areaOf(5, 0, 10, 10));
    // Depth 2 has nothing, so the child is drawn as the coarser fallback.
    close(area(gaps, "geofabrik", 2), areaOf(5, 0, 10, 10));
    close(area(gaps, "osmfr", "smallest"), areaOf(0, 0, 7, 10));
  });

  it("keeps only land that neither provider covers when both are shown", () => {
    close(area(gaps, "geofabrik+osmfr", "smallest"), areaOf(5, 0, 7, 10));
    close(area(gaps, "geofabrik+osmfr", 0), 0);
  });

  it("drops pieces under 10 km², like the uncovered island", () => {
    expect(gaps.features.flatMap((f) => f.geometry.coordinates).some((p) => p[0]![0]![0]! >= 20)).toBe(false);
  });

  it("covers only the providers that have boundaries", () => {
    const one = computeGaps({ osmfr }, LAND);
    expect(new Set(one.features.map((f) => f.properties.providers))).toEqual(new Set(["osmfr"]));
    // A provider with nothing at a level leaves all the land uncovered there.
    const empty = computeGaps({ geofabrik: collection([]) }, LAND);
    close(area(empty, "geofabrik", 0), areaOf(0, 0, 10, 10));
  });
});

describe("snapGeometry", () => {
  it("snaps to a 0.001° grid and drops rings that collapse", () => {
    const geometry: BoundaryGeometry = {
      type: "MultiPolygon",
      coordinates: [
        [box(0.00001, 0, 1.00049, 1), box(0.5, 0.5, 0.5002, 0.5002)],
        [box(5, 5, 5.0001, 5.0001)],
      ],
    };
    expect(snapGeometry(geometry)).toEqual([[box(0, 0, 1, 1)]]);
  });
});

describe("ringAreaKm2", () => {
  it("gives about 12,364 km² for a 1° square at the equator", () => {
    expect(Math.round(ringAreaKm2(box(0, 0, 1, 1)))).toBe(12364);
  });
});

describe("loadLand", () => {
  it("reads Natural Earth's land polygons", async () => {
    const land = await loadLand(LAND_FILE);
    expect(land.length).toBeGreaterThan(1000);
    // Total land area is about 149 million km².
    const total = land.reduce((sum, p) => sum + polygonAreaKm2(p), 0);
    expect(total / 1e6).toBeGreaterThan(140);
    expect(total / 1e6).toBeLessThan(155);
  });
});
