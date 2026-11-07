import { describe, expect, it } from "vitest";
import { HATCH_RGBA, hatchImage } from "./hatch.ts";

describe("hatchImage", () => {
  it("draws diagonal stripes that tile seamlessly", () => {
    const { width, height, data } = hatchImage(8, 2);
    expect([width, height, data.length]).toEqual([8, 8, 8 * 8 * 4]);
    const on = (x: number, y: number) => data[(y * 8 + x) * 4 + 3] !== 0;
    // Row 0 starts a stripe; each row below shifts it one pixel left, wrapping around.
    expect([...Array(8).keys()].map((x) => on(x, 0))).toEqual([true, true, false, false, false, false, false, false]);
    expect([...Array(8).keys()].map((x) => on(x, 1))).toEqual([true, false, false, false, false, false, false, true]);
    expect(Array.from(data.slice(0, 4))).toEqual([...HATCH_RGBA]);
    // The bottom row continues into the top row of the next tile.
    expect(on(1, 7) && on(0, 0)).toBe(true);
  });
});
