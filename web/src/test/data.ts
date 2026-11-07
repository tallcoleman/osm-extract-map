// Small, hand-built extracts and boundaries for frontend tests.
import axe from "axe-core";
import { expect } from "vitest";
import { type BoundaryCollection, type Extract, type Meta, type ProviderId, SCHEMA_VERSION } from "../../../shared/schema.ts";
import type { AppData } from "../lib/load.ts";

const HOST: Record<ProviderId, string> = { geofabrik: "https://download.geofabrik.de", osmfr: "https://download.openstreetmap.fr" };

export function makeExtract(provider: ProviderId, id: string, overrides: Partial<Extract> = {}): Extract {
  const base = `${HOST[provider]}/${id}`;
  return {
    key: `${provider}:${id}`,
    provider,
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    parentKey: null,
    depth: 1,
    isLeaf: true,
    isBundle: false,
    sizeBytes: 100 * 1024 * 1024,
    sizeCheckedAt: "2026-11-01T00:00:00Z",
    urls: { page: `${base}.html`, pbf: `${base}-latest.osm.pbf`, poly: `${base}.poly`, replication: `${base}-updates` },
    replication: { available: true, intervals: [provider === "osmfr" ? "minute" : "day"], status: "expected" },
    ...overrides,
  };
}

/** A square boundary for each extract, offset by its index so bounding boxes differ. */
export function boundariesFor(extracts: readonly Extract[]): BoundaryCollection {
  return {
    type: "FeatureCollection",
    features: extracts.map((e, i) => ({
      type: "Feature",
      properties: { key: e.key, depth: e.depth, isLeaf: e.isLeaf, isBundle: e.isBundle, name: e.name },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [i, i],
            [i + 1, i],
            [i + 1, i + 1],
            [i, i + 1],
            [i, i],
          ],
        ],
      },
    })),
  };
}

export const EXTRACTS: Extract[] = [
  makeExtract("geofabrik", "canada", { depth: 1, isLeaf: false, sizeBytes: 6.1 * 1024 ** 3 }),
  makeExtract("geofabrik", "quebec", { depth: 2, parentKey: "geofabrik:canada", sizeBytes: 1.2 * 1024 ** 3 }),
  makeExtract("geofabrik", "ontario", { depth: 2, parentKey: "geofabrik:canada", sizeBytes: null }),
  makeExtract("geofabrik", "dach", { depth: 1, isBundle: true }),
  makeExtract("osmfr", "canada", { name: "Canada", depth: 1, isLeaf: false }),
  makeExtract("osmfr", "quebec", { name: "Québec", depth: 2, isLeaf: false, parentKey: "osmfr:canada" }),
  makeExtract("osmfr", "nord_du_quebec", {
    name: "Nord du Quebec",
    depth: 3,
    parentKey: "osmfr:quebec",
    sizeBytes: 583 * 1024 * 1024,
    replication: { available: true, intervals: ["hour"], status: "differs" },
  }),
  makeExtract("osmfr", "monaco", { depth: 1, sizeBytes: 2 * 1024 * 1024, replication: { available: false, intervals: [], status: "none" } }),
];

export function makeMeta(overrides: Partial<Meta> = {}): Meta {
  return {
    generatedAt: "2026-11-06T18:00:00Z",
    schemaVersion: SCHEMA_VERSION,
    providers: {
      geofabrik: { extractCount: 4, fetchedAt: "2026-11-06T16:00:00Z", status: "ok" },
      osmfr: { extractCount: 4, fetchedAt: "2026-10-20T16:00:00Z", status: "ok" },
    },
    files: { extracts: "extracts.json", boundaries: { geofabrik: "boundaries-geofabrik.geojson", osmfr: "boundaries-osmfr.geojson" } },
    ...overrides,
  };
}

export function makeAppData(extracts: readonly Extract[] = EXTRACTS, meta: Meta = makeMeta()): AppData {
  const boundaries: AppData["boundaries"] = {};
  for (const p of ["geofabrik", "osmfr"] as const) {
    const mine = extracts.filter((e) => e.provider === p);
    if (mine.length) boundaries[p] = boundariesFor(mine);
  }
  return { meta, extracts: [...extracts], boundaries, failed: [] };
}

/**
 * Runs axe on a rendered container. Colour contrast can't be measured in jsdom;
 * contrast.test.ts checks the colour tokens instead.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(", ")}`)).toEqual([]);
}
