import { describe, expect, it } from "vitest";
import { boundariesFor, EXTRACTS } from "../test/data.ts";
import { bboxIndex, geometryBBox } from "./geo.ts";

describe("geometryBBox", () => {
  it("covers every ring of a multipolygon", () => {
    expect(
      geometryBBox({
        type: "MultiPolygon",
        coordinates: [
          [[[-180, 60], [-170, 60], [-170, 70], [-180, 60]]],
          [[[170, 50], [180, 50], [180, 71], [170, 50]], [[172, 55], [173, 55], [173, 56], [172, 55]]],
        ],
      }),
    ).toEqual([-180, 50, 180, 71]);
  });

  it("works for a polygon and skips malformed positions", () => {
    expect(geometryBBox({ type: "Polygon", coordinates: [[[1, 2], [3], [5, -4], [1, 2]]] })).toEqual([1, -4, 5, 2]);
  });
});

describe("bboxIndex", () => {
  it("indexes every feature by key", () => {
    const index = bboxIndex([boundariesFor(EXTRACTS.slice(0, 2)), boundariesFor(EXTRACTS.slice(4, 5))]);
    expect([...index.keys()]).toEqual(["geofabrik:canada", "geofabrik:quebec", "osmfr:canada"]);
    expect(index.get("geofabrik:quebec")).toEqual([1, 1, 2, 2]);
  });
});
