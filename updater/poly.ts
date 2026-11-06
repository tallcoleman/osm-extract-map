// Parser for Osmosis polygon filter files (.poly) into GeoJSON.
//
// Format: a first line with a name (free text, ignored), then sections. Each
// section is a name line, "lon lat" coordinate lines, and END. A final END
// closes the file. Sections whose name starts with "!" are holes.

import type { BoundaryGeometry, Position } from "../shared/schema.ts";

export class PolyParseError extends Error {
  constructor(source: string, reason: string) {
    super(`Could not parse .poly ${source}: ${reason}`);
    this.name = "PolyParseError";
  }
}

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;

/** Twice the signed area of a ring; positive when counter-clockwise. */
export function signedArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!);
  }
  return sum;
}

/** Ray-casting point-in-ring test. */
export function pointInRing(point: Position, ring: Position[]): boolean {
  const [x, y] = point as [number, number];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Returns the ring closed and wound counter-clockwise (outer) or clockwise (hole), per RFC 7946. */
function orient(ring: Position[], ccw: boolean): Position[] {
  const first = ring[0]!;
  const last = ring.at(-1)!;
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, [first[0]!, first[1]!]];
  return signedArea(closed) > 0 === ccw ? closed : closed.toReversed();
}

interface Section {
  name: string;
  hole: boolean;
  ring: Position[];
}

function parseSections(text: string, source: string): Section[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const sections: Section[] = [];
  let i = 1; // first line is the file name
  for (;;) {
    while (i < lines.length && lines[i] === "") i++;
    if (i >= lines.length) throw new PolyParseError(source, "missing final END");
    const name = lines[i++]!;
    if (name === "END") break;
    const ring: Position[] = [];
    for (;;) {
      if (i >= lines.length) throw new PolyParseError(source, `section "${name}" has no END`);
      const line = lines[i++]!;
      if (line === "END") break;
      if (line === "") continue;
      const parts = line.split(/\s+/);
      if (parts.length !== 2 || !parts.every((p) => NUMBER.test(p))) {
        throw new PolyParseError(source, `bad coordinate line "${line}" (line ${i})`);
      }
      const [lon, lat] = parts.map(Number) as [number, number];
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) {
        throw new PolyParseError(source, `coordinate out of range "${line}" (line ${i})`);
      }
      ring.push([lon, lat]);
    }
    if (ring.length < 3) throw new PolyParseError(source, `section "${name}" has fewer than 3 points`);
    sections.push({ name, hole: name.startsWith("!"), ring });
  }
  if (lines.slice(i).some((l) => l !== "")) throw new PolyParseError(source, "content after final END");
  return sections;
}

export function parsePoly(text: string, source = "input"): BoundaryGeometry {
  const sections = parseSections(text, source);
  const outers = sections.filter((s) => !s.hole).map((s) => ({ ring: orient(s.ring, true), holes: [] as Position[][] }));
  if (outers.length === 0) throw new PolyParseError(source, "no outer rings");

  for (const hole of sections.filter((s) => s.hole)) {
    // Real holes often touch their outer ring (e.g. Quebec's first hole starts
    // on the border), and a vertex on the edge can test either way. So the
    // hole goes to the outer ring containing most of its vertices; if outer
    // rings are nested, the smallest one wins a tie.
    const owner = outers
      .map((o) => ({ o, inside: hole.ring.filter((p) => pointInRing(p, o.ring)).length, area: Math.abs(signedArea(o.ring)) }))
      .filter((c) => c.inside > 0)
      .sort((a, b) => b.inside - a.inside || a.area - b.area)[0]?.o;
    if (!owner) throw new PolyParseError(source, `hole "${hole.name}" is not inside any outer ring`);
    owner.holes.push(orient(hole.ring, false));
  }

  const polygons = outers.map((o) => [o.ring, ...o.holes]);
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0]! }
    : { type: "MultiPolygon", coordinates: polygons };
}
