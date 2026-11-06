import { describe, expect, it } from "vitest";
import { computeLevels, LevelError, overridesFor, parseLevelOverrides } from "./levels.ts";
import { replicationStatus } from "./replication.ts";

const item = (key: string, parentKey: string | null = null) => ({ key, parentKey });

describe("computeLevels", () => {
  const tree = [
    item("g:europe"),
    item("g:france", "g:europe"),
    item("g:alsace", "g:france"),
    item("g:monaco", "g:europe"),
    item("g:russia"),
    item("g:kaliningrad", "g:russia"),
    item("g:antarctica"),
  ];

  it("sets depth from the number of ancestors and marks leaves", () => {
    const levels = computeLevels(tree);
    expect(Object.fromEntries(levels)).toEqual({
      "g:europe": { depth: 0, isLeaf: false },
      "g:france": { depth: 1, isLeaf: false },
      "g:alsace": { depth: 2, isLeaf: true },
      "g:monaco": { depth: 1, isLeaf: true },
      "g:russia": { depth: 0, isLeaf: false },
      "g:kaliningrad": { depth: 1, isLeaf: true },
      "g:antarctica": { depth: 0, isLeaf: true },
    });
  });

  it("doesn't depend on input order", () => {
    expect(computeLevels(tree.toReversed())).toEqual(computeLevels(tree));
  });

  it("applies overrides, and descendants follow", () => {
    const levels = computeLevels(tree, { "g:russia": 1 });
    expect(levels.get("g:russia")).toEqual({ depth: 1, isLeaf: false });
    expect(levels.get("g:kaliningrad")).toEqual({ depth: 2, isLeaf: true });
    expect(levels.get("g:europe")!.depth).toBe(0);
  });

  it("rejects an override for a missing key", () => {
    expect(() => computeLevels(tree, { "g:atlantis": 1 })).toThrow(new LevelError('level override for missing extract "g:atlantis"'));
  });

  it("rejects a missing parent", () => {
    expect(() => computeLevels([item("g:a", "g:nowhere")])).toThrow(LevelError);
  });

  it("rejects a parent cycle", () => {
    expect(() => computeLevels([item("g:a", "g:b"), item("g:b", "g:a")])).toThrow(/parent cycle/);
  });
});

describe("parseLevelOverrides", () => {
  it("accepts an object of key → depth", () => {
    expect(parseLevelOverrides({ "geofabrik:russia": 1, "osmfr:europe": 0 })).toEqual({ "geofabrik:russia": 1, "osmfr:europe": 0 });
    expect(parseLevelOverrides({})).toEqual({});
  });

  it.each([
    ["an array", []],
    ["null", null],
    ["a string", "x"],
    ["a key without a provider", { russia: 1 }],
    ["a negative depth", { "geofabrik:russia": -1 }],
    ["a fractional depth", { "geofabrik:russia": 1.5 }],
    ["a string depth", { "geofabrik:russia": "1" }],
  ])("rejects %s", (_, value) => {
    expect(() => parseLevelOverrides(value)).toThrow(LevelError);
  });
});

describe("overridesFor", () => {
  it("keeps one provider's overrides", () => {
    expect(overridesFor({ "geofabrik:russia": 1, "osmfr:russia": 2 }, "osmfr")).toEqual({ "osmfr:russia": 2 });
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
