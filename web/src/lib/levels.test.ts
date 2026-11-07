import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import { type Level, levelClass, type LevelFields, levelFilters, LEVELS } from "./levels.ts";

// Evaluates a filter the way MapLibre does, against a polygon feature with these properties.
const matches = (filter: unknown, props: LevelFields) =>
  featureFilter(filter as never, "filter").filter({ zoom: 0 }, { type: 3, properties: { ...props } } as never);

const CASES: LevelFields[] = [];
for (const depth of [0, 1, 2, 3])
  for (const isLeaf of [true, false]) for (const isBundle of [true, false]) CASES.push({ depth, isLeaf, isBundle });

const ALL_LEVELS = LEVELS.map((l) => l.value);

describe("levelClass", () => {
  it.each([
    [{ depth: 2, isLeaf: true, isBundle: false }, "smallest", "normal"],
    [{ depth: 2, isLeaf: false, isBundle: false }, "smallest", null],
    [{ depth: 1, isLeaf: true, isBundle: true }, "smallest", null],
    [{ depth: 2, isLeaf: false, isBundle: false }, 2, "normal"],
    [{ depth: 1, isLeaf: true, isBundle: false }, 2, "coarser"],
    [{ depth: 1, isLeaf: false, isBundle: false }, 2, null],
    [{ depth: 3, isLeaf: true, isBundle: false }, 2, null],
    [{ depth: 2, isLeaf: true, isBundle: true }, 2, null],
    [{ depth: 0, isLeaf: true, isBundle: false }, 0, "normal"],
  ] as const)("%o at level %s is %s", (fields, level, expected) => {
    expect(levelClass(fields, level as Level)).toBe(expected);
  });
});

describe("levelFilters", () => {
  // The map filters and the list's levelClass() must agree for every combination.
  it.each(ALL_LEVELS)("agree with levelClass at level %s", (level) => {
    const f = levelFilters(level);
    for (const props of CASES) {
      const cls = levelClass(props, level);
      expect(matches(f.normal, props), JSON.stringify({ props, level })).toBe(cls === "normal");
      expect(matches(f.coarser, props), JSON.stringify({ props, level })).toBe(cls === "coarser");
      expect(matches(f.any, props), JSON.stringify({ props, level })).toBe(cls !== null);
    }
  });

  it("offers smallest available first, then depths 0 to 3", () => {
    expect(LEVELS.map((l) => l.label)).toEqual(["Smallest available", "Continent", "Country", "Region", "Sub-region"]);
    expect(ALL_LEVELS).toEqual(["smallest", 0, 1, 2, 3]);
  });
});
