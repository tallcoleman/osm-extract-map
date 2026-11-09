import { describe, expect, it, vi } from "vitest";
import { geocode, PHOTON_URL, photonLang, toPlace } from "./geocode.ts";

const feature = (properties: Record<string, unknown>, coordinates: unknown = [-73.72, 45.56]) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties,
});

const respond = (body: unknown, status = 200) =>
  vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));

describe("photonLang", () => {
  it("sends only the languages Photon accepts", () => {
    expect(photonLang("fr-CA")).toBe("fr");
    expect(photonLang("EN")).toBe("en");
    expect(photonLang("de")).toBe("de");
    expect(photonLang("es-ES")).toBeNull();
    expect(photonLang(undefined)).toBeNull();
  });
});

describe("toPlace", () => {
  it("converts Photon's [west, north, east, south] extent to a bbox", () => {
    const place = toPlace(
      feature({ name: "Laval", state: "Québec", country: "Canada", extent: [-73.9, 45.7, -73.5, 45.5] }),
    );
    expect(place).toEqual({ label: "Laval", detail: "Québec, Canada", center: [-73.72, 45.56], bbox: [-73.9, 45.5, -73.5, 45.7] });
  });

  it("has no bbox for points or bad extents", () => {
    expect(toPlace(feature({ name: "Café" }))!.bbox).toBeNull();
    expect(toPlace(feature({ name: "Café", extent: [1, 2, 3] }))!.bbox).toBeNull();
    expect(toPlace(feature({ name: "Café", extent: [1, 2, 3, "4"] }))!.bbox).toBeNull();
    expect(toPlace(feature({ name: "Café", extent: [1, 2, 3, 4] }))!.bbox).toBeNull();
  });

  it("labels addresses by street and leaves out repeated names", () => {
    expect(toPlace(feature({ street: "Rue Principale", housenumber: "12", city: "Laval", country: "Canada" }))).toMatchObject({
      label: "Rue Principale 12",
      detail: "Laval, Canada",
    });
    expect(toPlace(feature({ name: "Gare", street: "Rue Principale", city: "Laval", state: "Laval" }))!.detail).toBe("Rue Principale, Laval");
    expect(toPlace(feature({ name: "Québec", state: "Québec", country: "Canada" }))!.detail).toBe("Canada");
  });

  it("drops features with no name or bad coordinates", () => {
    expect(toPlace(feature({ country: "Canada" }))).toBeNull();
    expect(toPlace(feature({ name: "X" }, [1]))).toBeNull();
    expect(toPlace(feature({ name: "X" }, [Number.NaN, 1]))).toBeNull();
    expect(toPlace({ properties: { name: "X" } })).toBeNull();
  });
});

describe("geocode", () => {
  it("asks Photon for five results in a supported language", async () => {
    const fetchFn = respond({ features: [feature({ name: "Laval" }), feature({})] });
    const signal = new AbortController().signal;
    const places = await geocode("Laval, QC", { fetchFn, signal, language: "fr-CA" });
    expect(places.map((p) => p.label)).toEqual(["Laval"]);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${PHOTON_URL}?q=Laval%2C+QC&limit=5&lang=fr`);
    expect(init?.signal).toBe(signal);
  });

  it("leaves out unsupported languages", async () => {
    const fetchFn = respond({ features: [] });
    expect(await geocode("Madrid", { fetchFn, language: "es" })).toEqual([]);
    expect(fetchFn.mock.calls[0]![0]).toBe(`${PHOTON_URL}?q=Madrid&limit=5`);
  });

  it("rejects on HTTP errors", async () => {
    await expect(geocode("Laval", { fetchFn: respond({}, 429) })).rejects.toThrow("HTTP 429");
  });

  it("copes with a body that has no features", async () => {
    expect(await geocode("Laval", { fetchFn: respond({}) })).toEqual([]);
  });
});
