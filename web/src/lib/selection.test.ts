import { describe, expect, it } from "vitest";
import { EXTRACTS, makeExtract } from "../test/data.ts";
import { selectionReducer, selectionTotals } from "./selection.ts";

describe("selectionReducer", () => {
  it("toggles keys in selection order", () => {
    let s = selectionReducer([], { type: "toggle", key: "a" });
    s = selectionReducer(s, { type: "toggle", key: "b" });
    expect(s).toEqual(["a", "b"]);
    expect(selectionReducer(s, { type: "toggle", key: "a" })).toEqual(["b"]);
  });

  it("removes a key, and returns the same state when there is nothing to change", () => {
    const s = ["a", "b"];
    expect(selectionReducer(s, { type: "remove", key: "a" })).toEqual(["b"]);
    expect(selectionReducer(s, { type: "remove", key: "x" })).toBe(s);
  });

  it("clears", () => {
    expect(selectionReducer(["a"], { type: "clear" })).toEqual([]);
    const empty: string[] = [];
    expect(selectionReducer(empty, { type: "clear" })).toBe(empty);
  });
});

describe("selectionTotals", () => {
  it("is empty for no extracts", () => {
    expect(selectionTotals([])).toEqual({ count: 0, bytes: 0, unknown: 0, byProvider: {} });
  });

  it("sums known sizes by provider and counts unknown ones", () => {
    const a = makeExtract("geofabrik", "a", { sizeBytes: 100 });
    const b = makeExtract("geofabrik", "b", { sizeBytes: null });
    const c = makeExtract("osmfr", "c", { sizeBytes: 50 });
    expect(selectionTotals([a, b, c])).toEqual({
      count: 3,
      bytes: 150,
      unknown: 1,
      byProvider: { geofabrik: { count: 2, bytes: 100, unknown: 1 }, osmfr: { count: 1, bytes: 50, unknown: 0 } },
    });
  });

  it("doesn't remove overlap between a country and its regions", () => {
    const [canada, quebec] = EXTRACTS;
    expect(selectionTotals([canada!, quebec!]).bytes).toBe(canada!.sizeBytes! + quebec!.sizeBytes!);
  });
});
