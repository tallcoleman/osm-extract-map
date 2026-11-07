import { describe, expect, it } from "vitest";
import { makeExtract } from "../test/data.ts";
import { parentNames, parentPaths } from "./parents.ts";

const europe = makeExtract("geofabrik", "europe", { depth: 0 });
const germany = makeExtract("geofabrik", "germany", { parentKey: europe.key });
const bayern = makeExtract("geofabrik", "bayern", { parentKey: germany.key, depth: 2 });

describe("parentNames", () => {
  it("lists parents outermost first", () => {
    const byKey = new Map([europe, germany, bayern].map((e) => [e.key, e]));
    expect(parentNames(bayern, byKey)).toEqual(["Europe", "Germany"]);
    expect(parentNames(europe, byKey)).toEqual([]);
  });

  it("stops at a missing parent or a cycle", () => {
    expect(parentNames(bayern, new Map([[bayern.key, bayern]]))).toEqual([]);
    const a = makeExtract("osmfr", "a", { parentKey: "osmfr:b" });
    const b = makeExtract("osmfr", "b", { parentKey: "osmfr:a" });
    expect(parentNames(a, new Map([a, b].map((e) => [e.key, e])))).toEqual(["B"]);
  });
});

describe("parentPaths", () => {
  it("joins the names for every extract", () => {
    const paths = parentPaths([europe, germany, bayern]);
    expect(paths.get(bayern.key)).toBe("Europe › Germany");
    expect(paths.get(europe.key)).toBe("");
  });
});
