import { describe, expect, it } from "vitest";
import { makeLogger } from "../test/helpers.ts";
import { type BoundaryGeometry, type Meta, PROVIDERS, SCHEMA_VERSION } from "../shared/schema.ts";
import type { ExtractDraft, ProviderData } from "./providers/types.ts";
import { badUrls, geometryBbox, validateMeta, validateProvider, ValidationError } from "./validate.ts";

const G = "https://download.geofabrik.de";
const square: BoundaryGeometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

function draft(id: string, overrides: Partial<ExtractDraft> = {}): ExtractDraft {
  return {
    key: `geofabrik:${id}`,
    provider: "geofabrik",
    id,
    name: id,
    parentKey: null,
    sizeBytes: null,
    sizeCheckedAt: null,
    urls: { page: `${G}/${id}.html`, pbf: `${G}/${id}-latest.osm.pbf`, poly: null, replication: null },
    replication: { available: false, intervals: [] },
    ...overrides,
  };
}

function data(extracts: ExtractDraft[], geometries?: Map<string, BoundaryGeometry>): ProviderData {
  return {
    extracts,
    geometries: geometries ?? new Map(extracts.map((e) => [e.key, square])),
    fetchedAt: "2026-11-06T00:00:00.000Z",
  };
}

const many = (n: number) => Array.from({ length: n }, (_, i) => draft(`e${i}`));

describe("geometryBbox", () => {
  it("computes the bounding box of a Polygon and a MultiPolygon", () => {
    expect(geometryBbox(square)).toEqual({ minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 });
    expect(
      geometryBbox({ type: "MultiPolygon", coordinates: [square.coordinates, [[[179, -5], [182, -5], [182, 5], [179, -5]]]] }),
    ).toEqual({ minLon: 0, minLat: -5, maxLon: 182, maxLat: 5 });
  });

  it.each([
    ["an unknown type", { type: "Point", coordinates: [0, 0] }],
    ["missing coordinates", { type: "Polygon" }],
    ["a polygon that isn't an array", { type: "MultiPolygon", coordinates: [3] }],
    ["a ring that isn't an array", { type: "Polygon", coordinates: [3] }],
    ["a short position", { type: "Polygon", coordinates: [[[0]]] }],
    ["a non-array position", { type: "Polygon", coordinates: [[3]] }],
    ["a string coordinate", { type: "Polygon", coordinates: [[["0", 0]]] }],
    ["a NaN coordinate", { type: "Polygon", coordinates: [[[Number.NaN, 0]]] }],
    ["a latitude past 90", { type: "Polygon", coordinates: [[[0, 0], [1, 91], [1, 0], [0, 0]]] }],
    ["no positions", { type: "Polygon", coordinates: [] }],
    ["a zero-width box", { type: "Polygon", coordinates: [[[0, 0], [0, 1], [0, 2], [0, 0]]] }],
    ["a zero-height box", { type: "Polygon", coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] }],
  ])("rejects %s", (_, geometry) => {
    expect(geometryBbox(geometry as BoundaryGeometry)).toBeNull();
  });
});

describe("badUrls", () => {
  it("accepts https URLs on the provider's own host and nulls", () => {
    expect(badUrls(draft("a"))).toEqual([]);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["http:", `http://download.geofabrik.de/a.html`],
    ["an off-site host", "https://evil.example.com/a.html"],
    ["the other provider's host", "https://download.openstreetmap.fr/a.html"],
    ["a homepage host", "https://www.geofabrik.de/"],
    ["an unparseable URL", "not a url"],
  ])("rejects %s", (_, url) => {
    expect(badUrls(draft("a", { urls: { page: url, pbf: null, poly: url, replication: null } }))).toEqual(["page", "poly"]);
  });
});

describe("validateProvider", () => {
  it("passes good data through", () => {
    const input = data([draft("a"), draft("b", { parentKey: "geofabrik:a" })]);
    const out = validateProvider("geofabrik", input, null, makeLogger());
    expect(out.extracts).toEqual(input.extracts);
    expect(out.geometries.size).toBe(2);
    expect(out.fetchedAt).toBe(input.fetchedAt);
  });

  it("drops and logs extracts with unsafe URLs, up to 10%", () => {
    const logger = makeLogger();
    const extracts = [...many(9), draft("bad", { urls: { page: "javascript:alert(1)", pbf: null, poly: null, replication: null } })];
    const out = validateProvider("geofabrik", data(extracts), null, logger);
    expect(out.extracts.map((e) => e.id)).not.toContain("bad");
    expect(out.geometries.has("geofabrik:bad")).toBe(false);
    expect(logger.find("dropped geofabrik:bad, unsafe URLs: page")).toHaveLength(1);
  });

  it("fails the provider when more than 10% of extracts have unsafe URLs", () => {
    const bad = { page: "http://download.geofabrik.de/x", pbf: null, poly: null, replication: null };
    const extracts = [...many(8), draft("x", { urls: bad }), draft("y", { urls: bad })];
    expect(() => validateProvider("geofabrik", data(extracts), null, makeLogger())).toThrow(/2 of 10 extracts have unsafe URLs/);
  });

  it("fails with no extracts", () => {
    expect(() => validateProvider("geofabrik", data([]), null, makeLogger())).toThrow(/no extracts/);
  });

  it("fails when the count drops more than 10% from the previous release", () => {
    expect(() => validateProvider("geofabrik", data(many(89)), 100, makeLogger())).toThrow(/89 extracts, down from 100/);
    expect(validateProvider("geofabrik", data(many(90)), 100, makeLogger()).extracts).toHaveLength(90);
    expect(validateProvider("geofabrik", data(many(200)), 100, makeLogger()).extracts).toHaveLength(200);
  });

  it("fails on a missing geometry", () => {
    expect(() => validateProvider("geofabrik", data([draft("a")], new Map()), null, makeLogger())).toThrow(
      new ValidationError("Geofabrik: geofabrik:a has no geometry"),
    );
  });

  it("fails on an empty geometry", () => {
    const empty: BoundaryGeometry = { type: "Polygon", coordinates: [] };
    expect(() => validateProvider("geofabrik", data([draft("a")], new Map([["geofabrik:a", empty]])), null, makeLogger())).toThrow(
      /invalid or empty geometry/,
    );
  });

  it("fails when a parent doesn't resolve", () => {
    expect(() => validateProvider("geofabrik", data([draft("a", { parentKey: "geofabrik:zz" })]), null, makeLogger())).toThrow(
      /parent "geofabrik:zz" of geofabrik:a not found/,
    );
  });

  it("fails when a parent was dropped for unsafe URLs", () => {
    const extracts = [
      ...many(20),
      draft("p", { urls: { page: "javascript:x", pbf: null, poly: null, replication: null } }),
      draft("c", { parentKey: "geofabrik:p" }),
    ];
    expect(() => validateProvider("geofabrik", data(extracts), null, makeLogger())).toThrow(/parent "geofabrik:p"/);
  });

  it("fails on duplicate keys", () => {
    expect(() => validateProvider("geofabrik", data([draft("a"), draft("a")]), null, makeLogger())).toThrow(/duplicate key/);
  });

  it("fails on records from the wrong provider or with a mismatched key", () => {
    const wrongProvider = { ...draft("a"), provider: "osmfr" as const };
    expect(() => validateProvider("geofabrik", data([wrongProvider]), null, makeLogger())).toThrow(/wrong provider or key/);
    expect(() => validateProvider("geofabrik", data([draft("a", { key: "geofabrik:b" })]), null, makeLogger())).toThrow(
      /wrong provider or key/,
    );
  });
});

describe("validateMeta", () => {
  const meta = (overrides: Partial<Meta> = {}): Meta => ({
    generatedAt: "2026-11-06T00:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    providers: { geofabrik: { extractCount: 1, fetchedAt: "2026-11-06T00:00:00.000Z", status: "ok" } },
    files: { extracts: "extracts.json", boundaries: { geofabrik: "boundaries-geofabrik.geojson" } },
    ...overrides,
  });

  it("accepts the current schema version", () => {
    expect(() => validateMeta(meta())).not.toThrow();
  });

  it("rejects another schema version", () => {
    expect(() => validateMeta(meta({ schemaVersion: SCHEMA_VERSION + 1 }))).toThrow(/schema version/);
  });

  it("rejects a release with no providers", () => {
    expect(() => validateMeta(meta({ providers: {} }))).toThrow(/no providers/);
  });

  it.each(["http://www.geofabrik.de/", "javascript:alert(1)", "https://evil.example.com/"])(
    "rejects a provider homepage of %s",
    (homepage) => {
      const providers = { ...PROVIDERS, geofabrik: { ...PROVIDERS.geofabrik, homepage } };
      expect(() => validateMeta(meta(), providers)).toThrow(/homepage/);
    },
  );
});
