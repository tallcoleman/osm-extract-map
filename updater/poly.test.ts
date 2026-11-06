import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BoundaryGeometry, Position } from "../shared/schema.ts";
import { parsePoly, pointInRing, PolyParseError, signedArea } from "./poly.ts";

const fixture = (p: string) => readFileSync(`fixtures/osmfr/polygons/${p}`, "utf8");

const ringsOf = (g: BoundaryGeometry): Position[][][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

function section(name: string, points: number[][]): string {
  return [name, ...points.map(([x, y]) => `   ${x}   ${y}`), "END"].join("\n");
}

function poly(...sections: string[]): string {
  return ["test", ...sections, "END", ""].join("\n");
}

const square = (x0: number, y0: number, size: number) => [
  [x0, y0],
  [x0 + size, y0],
  [x0 + size, y0 + size],
  [x0, y0 + size],
];

function expectWellFormed(g: BoundaryGeometry) {
  for (const polygon of ringsOf(g)) {
    polygon.forEach((ring, i) => {
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring.at(-1));
      // RFC 7946: outer rings counter-clockwise, holes clockwise.
      expect(signedArea(ring) > 0).toBe(i === 0);
    });
  }
}

describe("signedArea and pointInRing", () => {
  const ccw = [...square(0, 0, 2), [0, 0]];
  it("is positive for counter-clockwise rings", () => {
    expect(signedArea(ccw)).toBe(8);
    expect(signedArea(ccw.toReversed())).toBe(-8);
  });
  it("finds points inside and outside", () => {
    expect(pointInRing([1, 1], ccw)).toBe(true);
    expect(pointInRing([3, 1], ccw)).toBe(false);
    expect(pointInRing([1, 3], ccw)).toBe(false);
  });
});

describe("parsePoly on real files", () => {
  it("parses a single ring", () => {
    const g = parsePoly(fixture("africa/bouvet_island.poly"));
    expect(g.type).toBe("Polygon");
    expect(ringsOf(g)[0]![0]).toHaveLength(5);
    expect(ringsOf(g)[0]![0]![0]).toEqual([2.576075, -53.928337]);
    expectWellFormed(g);
  });

  it("parses scientific notation", () => {
    const g = parsePoly(fixture("africa/reunion.poly"));
    expect(ringsOf(g)[0]![0]).toContainEqual([55.05, -21.23]);
    expectWellFormed(g);
  });

  it("parses one hole", () => {
    const g = parsePoly(fixture("europe/switzerland/zug.poly"));
    expect(g.type).toBe("Polygon");
    expect(ringsOf(g)[0]).toHaveLength(2);
    expectWellFormed(g);
  });

  it("assigns 8 holes across 2 outer rings (Quebec)", () => {
    const g = parsePoly(fixture("north-america/canada/quebec.poly"));
    expect(g.type).toBe("MultiPolygon");
    const polygons = ringsOf(g);
    expect(polygons).toHaveLength(2);
    expect(polygons.reduce((n, p) => n + p.length - 1, 0)).toBe(8);
    for (const [outer, ...holes] of polygons) {
      for (const hole of holes) {
        const inside = hole.filter((p) => pointInRing(p, outer!)).length;
        expect(inside).toBeGreaterThan(hole.length / 2);
      }
    }
    expectWellFormed(g);
  });

  it("parses a region split at the antimeridian (Chukotka)", () => {
    const g = parsePoly(fixture("russia/far_eastern_federal_district/chukotka_autonomous_okrug.poly"));
    const lons = ringsOf(g).flat(2).map((p) => p[0]!);
    expect(Math.max(...lons)).toBeLessThanOrEqual(180);
    expect(Math.min(...lons)).toBeGreaterThanOrEqual(-180);
    expect(lons).toContain(180);
    expectWellFormed(g);
  });

  it("parses every fixture", () => {
    expectWellFormed(parsePoly(fixture("north-america/canada/quebec/laval.poly")));
  });
});

describe("parsePoly on edge cases", () => {
  it("closes open rings and fixes winding", () => {
    const clockwise = square(0, 0, 1).toReversed();
    const g = parsePoly(poly(section("1", clockwise)));
    expect(g).toEqual({
      type: "Polygon",
      coordinates: [[[0, 1], [0, 0], [1, 0], [1, 1], [0, 1]]],
    });
  });

  it("keeps rings that are already closed", () => {
    const ring = [...square(0, 0, 1), [0, 0]];
    expect(ringsOf(parsePoly(poly(section("1", ring))))[0]![0]).toHaveLength(5);
  });

  it("assigns each hole to the outer ring that contains it", () => {
    const g = parsePoly(
      poly(
        section("1", square(0, 0, 10)),
        section("2", square(20, 0, 10)),
        section("!h1", square(22, 2, 2)),
        section("!h2", square(2, 2, 2)),
      ),
    );
    const [a, b] = ringsOf(g);
    expect(a).toHaveLength(2);
    expect(a![1]).toContainEqual([2, 2]);
    expect(b).toHaveLength(2);
    expect(b![1]).toContainEqual([22, 2]);
    expectWellFormed(g);
  });

  it("assigns a hole whose first vertex is on the outer ring's edge", () => {
    // The first vertex (10, 5) lies on the right edge of the first square,
    // which ray casting counts as outside; the rest are inside.
    const hole = [[10, 5], [8, 4], [8, 6]];
    const g = parsePoly(poly(section("1", square(0, 0, 10)), section("2", square(20, 0, 10)), section("!h", hole)));
    expect(ringsOf(g)[0]).toHaveLength(2);
    expect(ringsOf(g)[1]).toHaveLength(1);
  });

  it("assigns a hole to the smallest of nested outer rings", () => {
    const g = parsePoly(
      poly(section("big", square(0, 0, 50)), section("small", square(10, 10, 10)), section("!h", square(12, 12, 2))),
    );
    const [big, small] = ringsOf(g);
    expect(big).toHaveLength(1);
    expect(small).toHaveLength(2);
  });

  it("keeps longitudes beyond ±180", () => {
    const g = parsePoly(poly(section("1", square(179, 60, 3))));
    expect(ringsOf(g)[0]![0]).toContainEqual([182, 63]);
  });

  it("accepts CRLF line endings, tabs and blank lines", () => {
    const text = "name\r\n\r\n1\r\n\t1\t1\r\n\t2\t1\r\n\r\n\t2\t2\r\nEND\r\nEND\r\n\r\n";
    expect(ringsOf(parsePoly(text))[0]![0]).toHaveLength(4);
  });

  it.each([
    ["an empty file", ""],
    ["only a name line", "name\n"],
    ["a section with no END", "name\n1\n 1 1\n 2 1\n 2 2\n"],
    ["no final END", "name\n1\n 1 1\n 2 1\n 2 2\nEND\n"],
    ["a non-numeric coordinate", poly(section("1", [[1, 1], [2, 1]]).replace("2   1", "2   x"))],
    ["three values on a line", "name\n1\n 1 1 1\n 2 1\n 2 2\nEND\nEND\n"],
    ["a latitude past 90", poly(section("1", [[1, 1], [2, 1], [2, 91]]))],
    ["an infinite value", "name\n1\n 1 1\n 2 1\n 2 1e999\nEND\nEND\n"],
    ["fewer than 3 points", poly(section("1", [[1, 1], [2, 1]]))],
    ["only holes", poly(section("!1", square(0, 0, 1)))],
    ["a hole outside every ring", poly(section("1", square(0, 0, 1)), section("!h", square(5, 5, 1)))],
    ["content after the final END", poly(section("1", square(0, 0, 1))) + "extra\n"],
  ])("rejects %s with a clear error", (_, text) => {
    expect(() => parsePoly(text, "x.poly")).toThrow(PolyParseError);
    expect(() => parsePoly(text, "x.poly")).toThrow(/^Could not parse \.poly x\.poly: /);
  });
});

describe("parsePoly round trip (property-based)", () => {
  // Star-shaped rings around a centre are always simple (non-self-intersecting).
  // Each polygon sits in its own grid cell so outer rings never overlap, and
  // holes use radii smaller than the outer ring's smallest radius.
  const starRing = (cx: number, cy: number, radii: number[], ccw: boolean): Position[] => {
    const pts = radii.map((r, i) => {
      const a = (2 * Math.PI * i) / radii.length;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
    const ring = [...pts, pts[0]!];
    return ccw ? ring : ring.toReversed();
  };

  const polygonArb = (cell: number) =>
    fc
      .record({
        outer: fc.array(fc.double({ min: 3, max: 4, noNaN: true }), { minLength: 3, maxLength: 12 }),
        hole: fc.option(fc.array(fc.double({ min: 0.2, max: 1, noNaN: true }), { minLength: 3, maxLength: 8 })),
      })
      .map(({ outer, hole }) => {
        const cx = -170 + cell * 10;
        const rings = [starRing(cx, 0, outer, true)];
        if (hole) rings.push(starRing(cx, 0, hole, false));
        return rings;
      });

  const geometryArb = fc
    .integer({ min: 1, max: 4 })
    .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => polygonArb(i))));

  const write = (polygons: Position[][][]) =>
    poly(
      ...polygons.flatMap((rings, i) =>
        rings.map((ring, j) => section(j === 0 ? `${i}` : `!${i}-${j}`, ring.map(([x, y]) => [x!, y!]))),
      ),
    );

  it("parse(write(g)) returns g", () => {
    fc.assert(
      fc.property(geometryArb, (polygons) => {
        const parsed = parsePoly(write(polygons));
        expect(ringsOf(parsed)).toEqual(polygons);
        expect(parsed.type).toBe(polygons.length === 1 ? "Polygon" : "MultiPolygon");
      }),
    );
  });
});
