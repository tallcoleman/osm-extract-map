import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../test/data.ts";
import { LevelSelector } from "./LevelSelector.tsx";
import { ProviderToggle } from "./ProviderToggle.tsx";

describe("ProviderToggle", () => {
  it("offers both, Geofabrik and OSM-FR", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<ProviderToggle value="both" available={["geofabrik", "osmfr"]} onChange={onChange} />);
    const group = screen.getByRole("group", { name: "Providers" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Both" })).toHaveProperty("checked", true);
    await user.click(screen.getByRole("radio", { name: "OSM-FR" }));
    expect(onChange).toHaveBeenCalledWith("osmfr");
    await expectNoAxeViolations(container);
  });

  it("can be used with arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProviderToggle value="both" available={["geofabrik", "osmfr"]} onChange={onChange} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Both" }));
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("geofabrik");
  });

  it("disables a provider with no data", async () => {
    const { container } = render(<ProviderToggle value="both" available={["geofabrik"]} onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "OSM-FR (not available yet)" })).toHaveProperty("disabled", true);
    await expectNoAxeViolations(container);
  });
});

describe("LevelSelector", () => {
  it("selects a level and explains the line styles", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container, rerender } = render(<LevelSelector value="smallest" onChange={onChange} />);
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual([
      "Smallest available",
      "Continent",
      "Country",
      "Region",
      "Sub-region",
    ]);
    expect(screen.queryByText(/Coarser/)).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Region" }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<LevelSelector value={2} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Region" })).toHaveProperty("checked", true);
    expect(screen.getByRole("list", { name: "Legend" }).textContent).toContain("Coarser: nothing at this level here");
    await expectNoAxeViolations(container);
  });
});
