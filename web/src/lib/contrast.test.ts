import { describe, expect, it } from "vitest";
import css from "../styles.css?raw";
import { contrastRatio, parseColor } from "./contrast.ts";
import { PROVIDER_COLORS } from "./providers.ts";

// axe can't measure contrast in jsdom, so the colour tokens are checked here.
const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi)].map((m) => [m[1]!, m[2]!]));
const token = (name: string) => {
  const v = tokens[name];
  if (!v) throw new Error(`No --${name} token in styles.css`);
  return v;
};

// Representative basemap colours from the MapTiler "dataviz" style: background (land) and water.
const BASEMAP = { land: "hsl(30, 25%, 98%)", water: "hsl(187, 36%, 87%)", landcover: "hsl(96, 44%, 79%)" };

describe("contrastRatio", () => {
  it("matches known values", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#fff", "#fff")).toBe(1);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("parses hsl", () => {
    expect(parseColor("hsl(0, 100%, 50%)")).toEqual([255, 0, 0]);
    expect(parseColor("hsl(120, 100%, 25%)")).toEqual([0, 128, 0]);
    expect(parseColor("hsl(240, 100%, 75%)")).toEqual([128, 128, 255]);
    expect(() => parseColor("red")).toThrow("Unsupported colour");
  });
});

describe("colour tokens", () => {
  it.each([
    ["text", "bg"],
    ["text", "surface"],
    ["text", "accent-bg"],
    ["text-muted", "bg"],
    ["text-muted", "surface"],
    ["text-muted", "accent-bg"],
    ["accent", "bg"],
    ["accent", "surface"],
    ["warning-text", "warning-bg"],
    ["notice-text", "notice-bg"],
    ["error-text", "error-bg"],
  ])("--%s on --%s is at least 4.5:1", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("focus outline is at least 3:1 against the page", () => {
    expect(contrastRatio(token("focus"), token("bg"))).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(PROVIDER_COLORS))("%s line colour is at least 3:1 against the basemap and sidebar", (_, color) => {
    for (const bg of [...Object.values(BASEMAP), token("bg"), token("surface")]) {
      expect(contrastRatio(color, bg), bg).toBeGreaterThanOrEqual(3);
    }
  });
});
