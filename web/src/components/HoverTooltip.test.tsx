import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeExtract } from "../test/data.ts";
import { HoverTooltip, placeTooltip } from "./HoverTooltip.tsx";

const tip = () => document.querySelector<HTMLElement>(".map-tooltip")!;

describe("HoverTooltip", () => {
  it("shows up to 6 extracts and counts the rest", () => {
    const extracts = Array.from({ length: 8 }, (_, i) => makeExtract("osmfr", `r${i}`, { sizeBytes: null }));
    render(<HoverTooltip x={10} y={10} width={800} height={600} extracts={extracts} />);
    expect(tip().querySelectorAll("strong")).toHaveLength(6);
    expect(tip().textContent).toContain("R0 · OSM-FR · Size unknown");
    expect(tip().textContent).toContain("and 2 more");
    expect(tip().textContent).toContain("Click to choose");
  });

  it("positions itself next to the cursor", () => {
    // jsdom has no layout, so the tooltip measures 0 × 0.
    render(<HoverTooltip x={100} y={50} width={800} height={600} extracts={[makeExtract("osmfr", "a")]} />);
    expect([tip().style.left, tip().style.top]).toEqual(["114px", "64px"]);
    expect(tip().textContent).not.toContain("Click to choose");
  });
});

describe("placeTooltip", () => {
  it("goes below and to the right of the cursor when it fits", () => {
    expect(placeTooltip(100, 50, 200, 40, 800, 600)).toEqual({ left: 114, top: 64 });
  });

  it("flips before the cursor near the right and bottom edges", () => {
    expect(placeTooltip(700, 580, 200, 40, 800, 600)).toEqual({ left: 486, top: 526 });
  });

  it("stays inside a map too narrow to fit it on either side", () => {
    // A phone-sized map: neither side of the cursor has room for 300px.
    expect(placeTooltip(150, 100, 300, 40, 390, 340)).toEqual({ left: 82, top: 114 });
    expect(placeTooltip(20, 100, 300, 40, 390, 340)).toEqual({ left: 34, top: 114 });
  });

  it("pins to the left edge when wider than the map", () => {
    expect(placeTooltip(100, 100, 500, 40, 390, 340)).toEqual({ left: 8, top: 114 });
  });
});
