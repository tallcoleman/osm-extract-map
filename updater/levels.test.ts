import { describe, expect, it } from "vitest";
import { computeLevels, LevelError, type LevelOverrides, NO_OVERRIDES, overridesFor, parseLevelOverrides } from "./levels.ts";
import { replicationStatus } from "./replication.ts";

const item = (key: string, parentKey: string | null = null) => ({ key, parentKey });

describe("computeLevels", () => {
  const tree = [
    item("g:europe"),
    item("g:france", "g:europe"),
    item("g:alsace", "g:france"),
    item("g:monaco", "g:europe"),
    item("g:alps", "g:europe"),
    item("g:russia"),
    item("g:kaliningrad", "g:russia"),
    item("g:antarctica"),
  ];
  const levelsOf = (...args: Parameters<typeof computeLevels>) => computeLevels(...args).levels;
  const overrides = (o: Partial<LevelOverrides>): LevelOverrides => ({ ...NO_OVERRIDES, ...o });

  it("sets depth from the number of ancestors and marks leaves", () => {
    expect(Object.fromEntries(levelsOf(tree))).toEqual({
      "g:europe": { depth: 0, isLeaf: false, isBundle: false },
      "g:france": { depth: 1, isLeaf: false, isBundle: false },
      "g:alsace": { depth: 2, isLeaf: true, isBundle: false },
      "g:monaco": { depth: 1, isLeaf: true, isBundle: false },
      "g:alps": { depth: 1, isLeaf: true, isBundle: false },
      "g:russia": { depth: 0, isLeaf: false, isBundle: false },
      "g:kaliningrad": { depth: 1, isLeaf: true, isBundle: false },
      "g:antarctica": { depth: 0, isLeaf: true, isBundle: false },
    });
  });

  it("doesn't depend on input order", () => {
    expect(levelsOf(tree.toReversed())).toEqual(levelsOf(tree));
  });

  it("applies depth overrides, and descendants follow", () => {
    const levels = levelsOf(tree, overrides({ depth: { "g:russia": 1 } }));
    expect(levels.get("g:russia")).toEqual({ depth: 1, isLeaf: false, isBundle: false });
    expect(levels.get("g:kaliningrad")).toEqual({ depth: 2, isLeaf: true, isBundle: false });
    expect(levels.get("g:europe")!.depth).toBe(0);
  });

  it("flags bundles without changing depth or leaves", () => {
    const { levels, missingBundles } = computeLevels(tree, overrides({ bundles: ["g:alps"] }));
    expect(levels.get("g:alps")).toEqual({ depth: 1, isLeaf: true, isBundle: true });
    expect(levels.get("g:monaco")!.isBundle).toBe(false);
    expect(missingBundles).toEqual([]);
  });

  it("returns bundles that aren't in the data instead of failing", () => {
    const { levels, missingBundles } = computeLevels(tree, overrides({ bundles: ["g:alps", "g:atlantis"] }));
    expect(missingBundles).toEqual(["g:atlantis"]);
    expect(levels.has("g:atlantis")).toBe(false);
  });

  it("rejects a depth override for a missing key", () => {
    expect(() => computeLevels(tree, overrides({ depth: { "g:atlantis": 1 } }))).toThrow(
      new LevelError('level override for missing extract "g:atlantis"'),
    );
  });

  it("rejects a missing parent", () => {
    expect(() => computeLevels([item("g:a", "g:nowhere")])).toThrow(LevelError);
  });

  it("rejects a parent cycle", () => {
    expect(() => computeLevels([item("g:a", "g:b"), item("g:b", "g:a")])).toThrow(/parent cycle/);
  });
});

describe("parseLevelOverrides", () => {
  it("accepts depth overrides and bundles", () => {
    expect(parseLevelOverrides({ depth: { "geofabrik:russia": 1, "osmfr:europe": 0 }, bundles: ["geofabrik:dach"] })).toEqual({
      depth: { "geofabrik:russia": 1, "osmfr:europe": 0 },
      bundles: ["geofabrik:dach"],
    });
  });

  it("treats missing fields as empty", () => {
    expect(parseLevelOverrides({})).toEqual(NO_OVERRIDES);
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a string", "x"],
    ["an unknown field", { russia: 1 }],
    ["depth as an array", { depth: [] }],
    ["a depth key without a provider", { depth: { russia: 1 } }],
    ["a negative depth", { depth: { "geofabrik:russia": -1 } }],
    ["a fractional depth", { depth: { "geofabrik:russia": 1.5 } }],
    ["a string depth", { depth: { "geofabrik:russia": "1" } }],
    ["bundles as an object", { bundles: {} }],
    ["a bundle without a provider", { bundles: ["dach"] }],
    ["a non-string bundle", { bundles: [1] }],
  ])("rejects %s", (_, value) => {
    expect(() => parseLevelOverrides(value)).toThrow(LevelError);
  });
});

describe("overridesFor", () => {
  it("keeps one provider's overrides", () => {
    expect(
      overridesFor({ depth: { "geofabrik:russia": 1, "osmfr:russia": 2 }, bundles: ["geofabrik:dach", "osmfr:x"] }, "osmfr"),
    ).toEqual({ depth: { "osmfr:russia": 2 }, bundles: ["osmfr:x"] });
  });
});

describe("replicationStatus", () => {
  it.each([
    [[], "minute", "none"],
    [["minute"], "minute", "expected"],
    [["minute", "hour", "day"], "minute", "expected"],
    [["day", "minute"], "minute", "expected"],
    [["hour"], "minute", "differs"],
    [["hour", "day"], "minute", "differs"],
    [["day"], "day", "expected"],
    [["minute"], "day", "differs"],
  ] as const)("%j with expected %s → %s", (intervals, expected, status) => {
    expect(replicationStatus(intervals, expected)).toBe(status);
  });
});
