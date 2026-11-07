import { describe, expect, it, vi } from "vitest";
import { boundariesFor, EXTRACTS, makeMeta } from "../test/data.ts";
import { FALLBACK_STYLE, loadData, loadGaps, loadStyleUrl, maptilerStyle } from "./load.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (url: string) => {
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return route();
  });
}

const geofabrik = EXTRACTS.filter((e) => e.provider === "geofabrik");
const osmfr = EXTRACTS.filter((e) => e.provider === "osmfr");

const routes = () => ({
  "/data/meta.json": () => json(makeMeta()),
  "/data/extracts.json": () => json(EXTRACTS),
  "/data/boundaries-geofabrik.geojson": () => json(boundariesFor(geofabrik)),
  "/data/boundaries-osmfr.geojson": () => json(boundariesFor(osmfr)),
});

describe("loadGaps", () => {
  const gaps = { type: "FeatureCollection", features: [] };
  const withGaps = makeMeta({ files: { extracts: "extracts.json", boundaries: {}, gaps: "gaps.geojson" } });

  it("loads the gaps file named in meta.json", async () => {
    expect(await loadGaps(withGaps, fakeFetch({ "/data/gaps.geojson": () => json(gaps) }))).toEqual(gaps);
  });

  it("returns null when there is no gaps file or it fails to load", async () => {
    const fetchFn = fakeFetch({});
    expect(await loadGaps(makeMeta(), fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await loadGaps(withGaps, fetchFn)).toBeNull();
    const bad = makeMeta({ files: { extracts: "extracts.json", boundaries: {}, gaps: "../gaps.geojson" } });
    expect(await loadGaps(bad, fetchFn)).toBeNull();
  });
});

describe("loadData", () => {
  it("loads meta, extracts and each provider's boundaries", async () => {
    const fetchFn = fakeFetch(routes());
    const data = await loadData(fetchFn);
    expect(data.meta.providers.geofabrik?.extractCount).toBe(4);
    expect(data.extracts).toHaveLength(EXTRACTS.length);
    expect(data.boundaries.osmfr?.features).toHaveLength(osmfr.length);
    expect(data.failed).toEqual([]);
    expect(fetchFn.mock.calls[0]![0]).toBe("/data/meta.json");
  });

  it("leaves out a provider whose boundaries fail, and its extracts", async () => {
    const data = await loadData(fakeFetch({ ...routes(), "/data/boundaries-osmfr.geojson": () => json({}, 500) }));
    expect(data.failed).toEqual(["osmfr"]);
    expect(data.boundaries.osmfr).toBeUndefined();
    expect(data.extracts.every((e) => e.provider === "geofabrik")).toBe(true);
  });

  it("only loads providers listed in meta.json", async () => {
    const meta = makeMeta({ providers: {}, files: { extracts: "extracts.json", boundaries: { geofabrik: "boundaries-geofabrik.geojson" } } });
    const fetchFn = fakeFetch({ ...routes(), "/data/meta.json": () => json(meta) });
    const data = await loadData(fetchFn);
    expect(Object.keys(data.boundaries)).toEqual(["geofabrik"]);
    expect(fetchFn.mock.calls.map((c) => c[0])).not.toContain("/data/boundaries-osmfr.geojson");
  });

  it("fails when meta.json or extracts.json can't be loaded", async () => {
    await expect(loadData(fakeFetch({}))).rejects.toThrow("/data/meta.json: HTTP 404");
    await expect(loadData(fakeFetch({ ...routes(), "/data/extracts.json": () => json({}, 503) }))).rejects.toThrow(
      "/data/extracts.json: HTTP 503",
    );
  });

  it("fails on a different schema version", async () => {
    const fetchFn = fakeFetch({ ...routes(), "/data/meta.json": () => json(makeMeta({ schemaVersion: 1 })) });
    await expect(loadData(fetchFn)).rejects.toThrow("Data format version 1 isn't supported");
  });

  it.each(["../secret.json", ".hidden", "a/b.json", "https://evil.example/x.json"])("refuses the data file name %s", async (file) => {
    const meta = makeMeta({ files: { extracts: file, boundaries: {} } });
    await expect(loadData(fakeFetch({ ...routes(), "/data/meta.json": () => json(meta) }))).rejects.toThrow("Unexpected data file name");
  });
});

describe("loadStyleUrl", () => {
  it("uses the MapTiler key from config.json, escaped", async () => {
    const url = await loadStyleUrl(fakeFetch({ "/config.json": () => json({ maptilerKey: "a b&c" }) }));
    expect(url).toBe("https://api.maptiler.com/maps/dataviz/style.json?key=a%20b%26c");
    expect(url).toBe(maptilerStyle("a b&c"));
  });

  it.each([
    ["no config.json", {}],
    ["an empty key", { "/config.json": () => json({ maptilerKey: "" }) }],
    ["a non-string key", { "/config.json": () => json({ maptilerKey: 42 }) }],
    ["invalid JSON", { "/config.json": () => new Response("{") }],
    ["a network error", { "/config.json": () => Promise.reject(new TypeError("offline")) }],
  ])("falls back to the keyless style with %s", async (_, r) => {
    expect(await loadStyleUrl(fakeFetch(r))).toBe(FALLBACK_STYLE);
  });
});
