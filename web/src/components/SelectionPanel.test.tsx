import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EXTRACTS, expectNoAxeViolations, makeExtract } from "../test/data.ts";
import { parentPaths } from "../lib/parents.ts";
import { SelectionPanel } from "./SelectionPanel.tsx";

const byKey = new Map(EXTRACTS.map((e) => [e.key, e]));
const parents = parentPaths(EXTRACTS);
const pick = (...keys: string[]) => keys.map((k) => byKey.get(k)!);

function setup(extracts = pick("geofabrik:quebec")) {
  const handlers = { onRemove: vi.fn(), onClear: vi.fn(), onZoom: vi.fn() };
  const view = render(<SelectionPanel extracts={extracts} parents={parents} {...handlers} />);
  return { ...view, ...handlers };
}

describe("SelectionPanel", () => {
  it("explains what to do when nothing is selected", async () => {
    const { container } = setup([]);
    expect(screen.getByText(/Click an area on the map or list below/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("shows the total, with a breakdown by provider when there are two", () => {
    setup(pick("geofabrik:quebec", "geofabrik:ontario", "osmfr:nord_du_quebec"));
    expect(screen.getByText(/Estimated total/).textContent).toBe("Estimated total: about 1.8 GB (+ 1 of unknown size)");
    expect(screen.getByText(/^Geofabrik:/).textContent).toBe("Geofabrik: 2 extracts, about 1.2 GB (+ 1 of unknown size)");
    expect(screen.getByText(/^OSM-FR:/).textContent).toBe("OSM-FR: 1 extract, about 583 MB");
  });

  it("shows each extract's parent regions", () => {
    setup(pick("osmfr:nord_du_quebec", "osmfr:monaco"));
    const [nord, monaco] = screen.getAllByRole("listitem").filter((li) => li.classList.contains("selected-item"));
    expect(nord!.querySelector(".row-path")!.textContent).toBe("Canada › Québec");
    expect(monaco!.querySelector(".row-path")).toBeNull();
  });

  it("has no breakdown for one provider, and says when no size is known", () => {
    setup(pick("geofabrik:ontario"));
    expect(screen.getByText(/Estimated total/).textContent).toBe("Estimated total: size unknown");
    expect(screen.queryByText(/^Geofabrik:/)).toBeNull();
  });

  it("announces the selection total", () => {
    setup(pick("geofabrik:quebec", "osmfr:monaco"));
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe("2 extracts selected, about 1.2 GB");
  });

  it("lists each extract with details, badge, provider link and copy buttons", async () => {
    const { container } = setup(pick("osmfr:nord_du_quebec", "osmfr:monaco"));
    const items = container.querySelectorAll(".selected-item");
    const nord = within(items[0] as HTMLElement);
    expect(nord.getByText(/Minutely|Hourly updates$/).textContent).toContain("583 MB · Hourly updates");
    expect(nord.getByText(/Hourly updates only/).textContent).toContain("Hourly updates only (OSM-FR default is minutely)");
    const link = nord.getByRole("link", { name: "OSM-FR page for Nord du Quebec (opens in a new tab)" });
    expect(link.getAttribute("href")).toBe("https://download.openstreetmap.fr/nord_du_quebec.html");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(nord.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "Zoom to Nord du Quebec",
      "Remove Nord du Quebec from selection",
      "Copy .pbf URL for Nord du Quebec",
      "Copy replication URL for Nord du Quebec",
    ]);
    expect(within(items[1] as HTMLElement).getByText(/No change files/)).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("doesn't link or copy unsafe URLs", () => {
    const bad = makeExtract("geofabrik", "bad", {
      urls: { page: "javascript:alert(1)", pbf: "https://evil.example/x.pbf", poly: null, replication: "http://download.geofabrik.de/x" },
    });
    setup([bad]);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Copy/ })).toBeNull();
  });

  it("removes, clears and zooms", async () => {
    const user = userEvent.setup();
    const { onRemove, onClear, onZoom } = setup(pick("geofabrik:quebec"));
    await user.click(screen.getByRole("button", { name: "Remove Quebec from selection" }));
    expect(onRemove).toHaveBeenCalledWith("geofabrik:quebec");
    await user.click(screen.getByRole("button", { name: "Zoom to Quebec" }));
    expect(onZoom).toHaveBeenCalledWith("geofabrik:quebec");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("copies a URL to the clipboard", async () => {
    const user = userEvent.setup();
    setup(pick("geofabrik:quebec"));
    await user.click(screen.getByRole("button", { name: "Copy .pbf URL for Quebec" }));
    expect(await navigator.clipboard.readText()).toBe("https://download.geofabrik.de/quebec-latest.osm.pbf");
  });
});
