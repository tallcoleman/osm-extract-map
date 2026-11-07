import { describe, expect, it } from "vitest";
import { EXTRACTS, makeExtract } from "../test/data.ts";
import { type ListItem, normalizeText, sortItems, visibleExtracts } from "./search.ts";

const keys = (items: ListItem[]) => items.map((i) => i.extract.key);
const both = ["geofabrik", "osmfr"] as const;

describe("normalizeText", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalizeText("Québec")).toBe("quebec");
    expect(normalizeText("  Cote d'Or ")).toBe("cote d or");
    expect(normalizeText("Provence-Alpes-Côte d’Azur")).toBe("provence alpes cote d azur");
  });
});

describe("visibleExtracts", () => {
  it("shows leaves at smallest available, without bundles", () => {
    expect(keys(visibleExtracts(EXTRACTS, { providers: both, level: "smallest", query: "" }))).toEqual([
      "geofabrik:quebec",
      "geofabrik:ontario",
      "osmfr:nord_du_quebec",
      "osmfr:monaco",
    ]);
  });

  it("marks coarser leaves at a deeper level", () => {
    const items = visibleExtracts(EXTRACTS, { providers: both, level: 3, query: "" });
    expect(items.map((i) => [i.extract.key, i.coarser])).toEqual([
      ["geofabrik:quebec", true],
      ["geofabrik:ontario", true],
      ["osmfr:nord_du_quebec", false],
      ["osmfr:monaco", true],
    ]);
  });

  it("limits to the chosen providers", () => {
    expect(keys(visibleExtracts(EXTRACTS, { providers: ["osmfr"], level: 1, query: "" }))).toEqual(["osmfr:canada", "osmfr:monaco"]);
    expect(visibleExtracts(EXTRACTS, { providers: [], level: 1, query: "" })).toEqual([]);
  });

  it("matches every word of the query, ignoring accents", () => {
    expect(keys(visibleExtracts(EXTRACTS, { providers: both, level: 2, query: "QUEBEC" }))).toEqual(["geofabrik:quebec", "osmfr:quebec"]);
    expect(keys(visibleExtracts(EXTRACTS, { providers: both, level: 3, query: "du nord" }))).toEqual(["osmfr:nord_du_quebec"]);
    expect(keys(visibleExtracts(EXTRACTS, { providers: both, level: 3, query: "  " }))).toHaveLength(4);
    expect(visibleExtracts(EXTRACTS, { providers: both, level: 3, query: "zzz" })).toEqual([]);
  });
});

describe("sortItems", () => {
  const item = (id: string, name: string, sizeBytes: number | null, provider: "geofabrik" | "osmfr" = "geofabrik"): ListItem => ({
    extract: makeExtract(provider, id, { name, sizeBytes }),
    coarser: false,
  });
  const items = [item("b", "beta", 5), item("a2", "Alpha", null, "osmfr"), item("a", "alpha", null), item("c", "Region 10", 1), item("d", "Region 9", 5)];

  it("sorts by name, case-insensitive and numeric, then provider", () => {
    expect(sortItems(items, "name").map((i) => i.extract.key)).toEqual(["geofabrik:a", "osmfr:a2", "geofabrik:b", "geofabrik:d", "geofabrik:c"]);
  });

  it("sorts by size from smallest, unknown last, ties by name", () => {
    expect(sortItems(items, "size").map((i) => i.extract.key)).toEqual(["geofabrik:c", "geofabrik:b", "geofabrik:d", "geofabrik:a", "osmfr:a2"]);
  });

  it("doesn't change its input", () => {
    const copy = [...items];
    sortItems(items, "size");
    expect(items).toEqual(copy);
  });
});
