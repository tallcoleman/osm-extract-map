import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeClock, makeLogger, makeTempDir } from "../../test/helpers.ts";
import { getMockAgent } from "../../test/mock-agent.ts";
import { HttpClient, HttpError } from "../http.ts";
import { fetchGeofabrik, type IndexFeature, parseSizePage, tidyIndex } from "./geofabrik.ts";
import { ProviderFormatError } from "./types.ts";

const ORIGIN = "https://download.geofabrik.de";
const INDEX = readFileSync("fixtures/geofabrik/index-v1.json", "utf8");
const CANADA = readFileSync("fixtures/geofabrik/canada.html", "utf8");
const TOP = readFileSync("fixtures/pipeline/download.geofabrik.de/index.html", "utf8");

let tmp: Awaited<ReturnType<typeof makeTempDir>>;
beforeEach(async () => {
  tmp = await makeTempDir("geofabrik-test-");
});
afterEach(() => tmp.cleanup());

function setup() {
  const clock = makeClock();
  const logger = makeLogger();
  const http = new HttpClient({
    cacheDir: tmp.dir,
    allowedHosts: ["download.geofabrik.de"],
    userAgent: "test",
    minIntervalMs: 0,
    maxRetries: 0,
    now: clock.now,
    sleep: clock.sleep,
    logger,
  });
  return { http, logger, clock };
}

const pool = () => getMockAgent().get(ORIGIN);

function feature(id: string, extra: Record<string, unknown> = {}, geometry: unknown = square) {
  return {
    type: "Feature",
    properties: { id, name: id.toUpperCase(), urls: { pbf: `${ORIGIN}/${id}-latest.osm.pbf`, updates: `${ORIGIN}/${id}-updates` }, ...extra },
    geometry,
  };
}
const square = { type: "MultiPolygon", coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]]] };
const index = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });

describe("parseSizePage", () => {
  it("reads sub-region sizes from a region page", () => {
    const sizes = parseSizePage(CANADA, `${ORIGIN}/north-america/canada.html`);
    expect(sizes.size).toBe(13);
    expect(sizes.get(`${ORIGIN}/north-america/canada/alberta-latest.osm.pbf`)).toBe(335 * 1024 ** 2);
    expect(sizes.get(`${ORIGIN}/north-america/canada/british-columbia-latest.osm.pbf`)).toBe(Math.round(1.2 * 1024 ** 3));
  });

  it("reads top-level sizes from index.html, with ./ links", () => {
    const sizes = parseSizePage(TOP, `${ORIGIN}/index.html`);
    expect(sizes.get(`${ORIGIN}/antarctica-latest.osm.pbf`)).toBe(Math.round(31.6 * 1024 ** 2));
    expect(sizes.get(`${ORIGIN}/europe-latest.osm.pbf`)).toBe(Math.round(33 * 1024 ** 3));
  });

  it.each([
    ["KB", 1024],
    ["TB", 1024 ** 4],
  ])("understands %s", (unit, factor) => {
    const html = `<a href="x-latest.osm.pbf">[.osm.pbf]</a></td><td>(2&nbsp;${unit})</td>`;
    expect(parseSizePage(html, `${ORIGIN}/a.html`).get(`${ORIGIN}/x-latest.osm.pbf`)).toBe(2 * factor);
  });

  it("finds nothing in an unrelated page", () => {
    expect(parseSizePage("<html>hello</html>", `${ORIGIN}/a.html`).size).toBe(0);
  });
});

describe("tidyIndex", () => {
  const f = (id: string, parent: string | null, name = id): IndexFeature => ({
    id,
    parent,
    name,
    pbf: `${ORIGIN}/${id}-latest.osm.pbf`,
    updates: null,
    geometry: { type: "MultiPolygon", coordinates: [] },
  });
  const tidy = (...features: IndexFeature[]) => tidyIndex(features).map((x) => [x.id, x.parent, x.name]);

  it("moves us/<state> from beside us to under it, and names it", () => {
    expect(
      tidy(
        f("north-america", null, "North America"),
        f("us", "north-america", "United States of America"),
        f("us/alabama", "north-america"),
        f("us/georgia", "north-america", "Georgia"),
        f("us/district-of-columbia", "north-america"),
        f("us/us-virgin-islands", "north-america"),
        f("us/california", "north-america"),
        f("us/california/norcal", "us/california", "Northern California"),
      ),
    ).toEqual([
      ["north-america", null, "North America"],
      ["us", "north-america", "United States of America"],
      ["us/alabama", "us", "Alabama"],
      ["us/georgia", "us", "Georgia"],
      ["us/district-of-columbia", "us", "District of Columbia"],
      ["us/us-virgin-islands", "us", "US Virgin Islands"],
      ["us/california", "us", "California"],
      ["us/california/norcal", "us/california", "Northern California"],
    ]);
  });

  it("leaves a slash id alone when the prefix isn't a sibling or doesn't exist", () => {
    expect(tidy(f("a", null, "A"), f("b", "a", "B"), f("b/x", "a", "X"), f("a/y", "b", "Y"), f("z/w", null, "W"))).toEqual([
      ["a", null, "A"],
      ["b", "a", "B"],
      ["b/x", "b", "X"],
      ["a/y", "b", "Y"],
      ["z/w", null, "W"],
    ]);
  });

  it("names a top-level extract whose name is its id", () => {
    expect(tidy(f("south-america", null))).toEqual([["south-america", null, "South America"]]);
  });
});

describe("fetchGeofabrik", () => {
  it("maps index features to extracts", async () => {
    const { http } = setup();
    pool().intercept({ path: "/index-v1.json" }).reply(200, INDEX);
    const data = await fetchGeofabrik(http, { skipSizes: true, logger: makeLogger() });

    expect(data.extracts).toHaveLength(10);
    expect(data.geometries.size).toBe(10);
    expect(data.fetchedAt).toBe("2026-11-06T12:00:00.000Z");
    const quebec = data.extracts.find((e) => e.id === "quebec")!;
    expect(quebec).toEqual({
      key: "geofabrik:quebec",
      provider: "geofabrik",
      id: "quebec",
      name: "Quebec",
      parentKey: "geofabrik:canada",
      sizeBytes: null,
      sizeCheckedAt: null,
      urls: {
        page: `${ORIGIN}/north-america/canada/quebec.html`,
        pbf: `${ORIGIN}/north-america/canada/quebec-latest.osm.pbf`,
        poly: `${ORIGIN}/north-america/canada/quebec.poly`,
        replication: `${ORIGIN}/north-america/canada/quebec-updates`,
      },
      replication: { available: true, intervals: ["day"] },
    });
    expect(data.extracts.find((e) => e.id === "russia")!.parentKey).toBeNull();
    expect(data.geometries.get("geofabrik:quebec")!.type).toBe("MultiPolygon");
  });

  it("reads sizes from index.html and parent pages, logging what's missing", async () => {
    const { http, clock } = setup();
    const logger = makeLogger();
    pool().intercept({ path: "/index-v1.json" }).reply(200, INDEX);
    pool().intercept({ path: "/index.html" }).reply(200, TOP);
    pool().intercept({ path: "/north-america.html" }).reply(404, "");
    pool().intercept({ path: "/north-america/canada.html" }).reply(() => {
      clock.advance(1000);
      return { statusCode: 200, data: CANADA };
    });
    pool().intercept({ path: "/russia.html" }).replyWithError(new Error("boom"));
    pool().intercept({ path: "/europe.html" }).reply(200, "<html>new layout</html>");

    const data = await fetchGeofabrik(http, { logger });
    const size = (id: string) => data.extracts.find((e) => e.id === id)!;

    expect(size("europe")).toMatchObject({ sizeBytes: Math.round(33 * 1024 ** 3), sizeCheckedAt: "2026-11-06T12:00:00.000Z" });
    expect(size("quebec")).toMatchObject({ sizeBytes: Math.round(1.1 * 1024 ** 3), sizeCheckedAt: "2026-11-06T12:00:01.000Z" });
    expect(size("canada")).toMatchObject({ sizeBytes: null, sizeCheckedAt: null });
    expect(size("kaliningrad").sizeBytes).toBeNull();
    expect(logger.find("no sizes from https://download.geofabrik.de/north-america.html (Expected 200, got 404")).toHaveLength(1);
    expect(logger.find("no sizes from https://download.geofabrik.de/russia.html")).toHaveLength(1);
    expect(logger.find("no sizes found in https://download.geofabrik.de/europe.html")).toHaveLength(1);
    expect(logger.find("no size for 4 extracts: canada, russia, kaliningrad, monaco")).toHaveLength(1);
  });

  it("leaves page and .poly empty when the .pbf URL isn't -latest, and skips its size page", async () => {
    const { http } = setup();
    pool()
      .intercept({ path: "/index-v1.json" })
      .reply(200, index(feature("odd", { urls: { pbf: `${ORIGIN}/odd.osm.pbf` } }), feature("kid", { parent: "odd" })));
    pool().intercept({ path: "/index.html" }).reply(200, TOP);
    const data = await fetchGeofabrik(http, { logger: makeLogger() });
    expect(data.extracts[0]!.urls).toEqual({ page: null, pbf: `${ORIGIN}/odd.osm.pbf`, poly: null, replication: null });
    expect(data.extracts[0]!.replication).toEqual({ available: false, intervals: [] });
  });

  it.each([404, 503])("fails when the index returns %i", async (status) => {
    const { http } = setup();
    pool().intercept({ path: "/index-v1.json" }).reply(status, "");
    await expect(fetchGeofabrik(http, { logger: makeLogger() })).rejects.toThrow(HttpError);
  });

  it.each([
    ["invalid JSON", "{", /not valid JSON/],
    ["a non-FeatureCollection", JSON.stringify({ type: "Feature" }), /not a FeatureCollection/],
    ["features that aren't an array", JSON.stringify({ type: "FeatureCollection", features: {} }), /not a FeatureCollection/],
    ["null", "null", /not a FeatureCollection/],
    ["a feature without properties", index({ type: "Feature" }), /feature 0 has no id or name/],
    ["a null feature", index(null), /feature 0 has no id or name/],
    ["a feature without a name", index(feature("a", { name: "" })), /feature 0 \(a\) has no id or name/],
    ["a numeric parent", index(feature("a", { parent: 3 })), /has a bad parent/],
    ["no urls", index(feature("a", { urls: undefined })), /has no urls.pbf/],
    ["no pbf", index(feature("a", { urls: {} })), /has no urls.pbf/],
    ["a bad updates URL", index(feature("a", { urls: { pbf: "x", updates: 1 } })), /bad urls.updates/],
    ["no geometry", index(feature("a", {}, null)), /no Polygon or MultiPolygon/],
    ["a Point geometry", index(feature("a", {}, { type: "Point", coordinates: [0, 0] })), /no Polygon/],
    ["geometry without coordinates", index(feature("a", {}, { type: "Polygon" })), /no Polygon/],
    ["a duplicate id", index(feature("a"), feature("a")), /"a" appears twice/],
  ])("rejects %s", async (_, body, message) => {
    const { http } = setup();
    pool().intercept({ path: "/index-v1.json" }).reply(200, body);
    const error = await fetchGeofabrik(http, { skipSizes: true, logger: makeLogger() }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderFormatError);
    expect((error as Error).message).toMatch(message);
  });

});
