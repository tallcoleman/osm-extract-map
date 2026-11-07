import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeExtract } from "../test/data.ts";
import { HoverTooltip } from "./HoverTooltip.tsx";

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

  it("stays inside the map near the right and bottom edges", () => {
    const { rerender } = render(<HoverTooltip x={10} y={10} width={800} height={600} extracts={[makeExtract("osmfr", "a")]} />);
    expect(tip().style.transform).toBe("translate(14px, 14px)");
    expect(tip().textContent).not.toContain("Click to choose");
    rerender(<HoverTooltip x={700} y={500} width={800} height={600} extracts={[makeExtract("osmfr", "a")]} />);
    expect(tip().style.transform).toBe("translate(calc(-100% - 14px), calc(-100% - 14px))");
  });
});
