import { describe, expect, it } from "vitest";
import { EXTRACTS } from "../test/data.ts";
import { pickerCandidates } from "./picker.ts";

const byKey = new Map(EXTRACTS.map((e) => [e.key, e]));
const f = (key: unknown) => ({ properties: { key } });

describe("pickerCandidates", () => {
  it("removes duplicates and unknown keys, smallest first", () => {
    const out = pickerCandidates(
      [f("geofabrik:canada"), f("osmfr:nord_du_quebec"), f("geofabrik:quebec"), f("geofabrik:canada"), f("nope:x"), f(42), {}, { properties: null }],
      byKey,
    );
    expect(out.map((e) => e.key)).toEqual(["osmfr:nord_du_quebec", "geofabrik:quebec", "geofabrik:canada"]);
  });

  it("orders same-depth extracts by size, unknown last, then provider and name", () => {
    const out = pickerCandidates([f("geofabrik:ontario"), f("osmfr:quebec"), f("geofabrik:quebec")], byKey);
    expect(out.map((e) => e.key)).toEqual(["osmfr:quebec", "geofabrik:quebec", "geofabrik:ontario"]);
    const same = pickerCandidates([f("osmfr:canada"), f("geofabrik:dach")], byKey);
    expect(same.map((e) => e.key)).toEqual(["geofabrik:dach", "osmfr:canada"]);
  });

  it("is empty with no features", () => {
    expect(pickerCandidates([], byKey)).toEqual([]);
  });
});
