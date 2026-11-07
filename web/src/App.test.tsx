import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import type { AppData } from "./lib/load.ts";
import { EXTRACTS, expectNoAxeViolations, makeAppData } from "./test/data.ts";
import { fakeMap, mapProps, resetMapMock } from "./test/map-mock.tsx";

vi.mock("react-map-gl/maplibre", () => import("./test/map-mock.tsx"));

const STYLE = "https://example.test/style.json";

function setup(loadData: () => Promise<AppData> = async () => makeAppData()) {
  const user = userEvent.setup();
  const view = render(<App loadData={loadData} loadStyleUrl={async () => STYLE} />);
  return { ...view, user };
}

async function ready() {
  return screen.findByRole("heading", { name: "Selection" });
}

const listRows = () => {
  const list = screen.getByRole("heading", { name: "Extracts on the map" }).closest("section")!;
  return within(list)
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-pressed"));
};
const rowNames = () => listRows().map((r) => `${r.querySelector(".row-name")!.textContent} ${r.querySelector(".provider-tag")!.textContent}`);
const selectionPanel = () => screen.getByRole("heading", { name: "Selection" }).closest("section")!;

beforeEach(resetMapMock);

describe("App loading", () => {
  it("shows loading, then the controls, list and map", async () => {
    const { container } = setup();
    expect(screen.getByRole("status").textContent).toBe("Loading extracts…");
    await ready();
    expect(screen.queryByText("Loading extracts…")).toBeNull();
    expect(mapProps.mapStyle).toBe(STYLE);
    expect(screen.getByRole("main", { name: "Map of extract boundaries" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("loads the coverage gaps after the data, then hatches and explains them", async () => {
    const gaps = { type: "FeatureCollection" as const, features: [] };
    const loadGaps = vi.fn(async () => gaps);
    render(<App loadData={async () => makeAppData()} loadStyleUrl={async () => STYLE} loadGaps={loadGaps} />);
    expect(await screen.findByText("No extract shown at this level")).toBeTruthy();
    expect(loadGaps).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: expect.any(Number) }));
  });

  it("shows a map placeholder until the style URL is known", async () => {
    render(<App loadData={async () => makeAppData()} loadStyleUrl={() => new Promise(() => {})} />);
    await ready();
    expect(screen.getByText("Loading map…")).toBeTruthy();
  });

  it("shows an error, and loads again on retry", async () => {
    const loadData = vi.fn<() => Promise<AppData>>().mockRejectedValueOnce(new Error("HTTP 500")).mockResolvedValueOnce(makeAppData());
    const { user, container } = setup(loadData);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The extract data couldn't be loaded: HTTP 500");
    await expectNoAxeViolations(container);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
    expect(loadData).toHaveBeenCalledTimes(2);
  });

  it("reports non-Error failures too", async () => {
    setup(() => Promise.reject("offline"));
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't be loaded: offline");
  });
});

describe("App controls", () => {
  it("lists the smallest extracts from both providers by default", async () => {
    setup();
    await ready();
    expect(rowNames()).toEqual(["Monaco OSM-FR", "Nord du Quebec OSM-FR", "Ontario Geofabrik", "Quebec Geofabrik"]);
    expect(mapProps.interactiveLayerIds).toEqual(["geofabrik-fill", "osmfr-fill"]);
  });

  it("filters by provider, level and search", async () => {
    const { user } = setup();
    await ready();
    await user.click(screen.getByRole("radio", { name: "Geofabrik" }));
    expect(rowNames()).toEqual(["Ontario Geofabrik", "Quebec Geofabrik"]);
    expect(mapProps.interactiveLayerIds).toEqual(["geofabrik-fill"]);
    await user.click(screen.getByRole("radio", { name: "Both" }));
    await user.click(screen.getByRole("radio", { name: "Country" }));
    expect(rowNames()).toEqual(["Canada Geofabrik", "Canada OSM-FR", "Monaco OSM-FR"]);
    await user.type(screen.getByRole("searchbox"), "mon");
    expect(rowNames()).toEqual(["Monaco OSM-FR"]);
  });

  it("selects from the list: zooms, outlines and totals", async () => {
    const { user } = setup();
    await ready();
    await user.click(listRows()[2]!);
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(1);
    expect(listRows()[2]!.getAttribute("aria-pressed")).toBe("true");
    const panel = within(selectionPanel());
    expect(panel.getByRole("button", { name: "Zoom to Ontario" })).toBeTruthy();
    expect(panel.getByText(/Estimated total/).textContent).toBe("Estimated total: size unknown");

    await user.click(listRows()[0]!);
    expect(panel.getByText(/Estimated total/).textContent).toBe("Estimated total: about 2.0 MB (+ 1 of unknown size)");

    await user.click(panel.getByRole("button", { name: "Zoom to Monaco" }));
    expect(fakeMap.fitBounds).toHaveBeenCalledTimes(3);

    await user.click(panel.getByRole("button", { name: "Remove Ontario from selection" }));
    expect(panel.queryByRole("button", { name: "Zoom to Ontario" })).toBeNull();
    await user.click(panel.getByRole("button", { name: "Clear" }));
    expect(panel.getByText(/Click an area on the map or list below/)).toBeTruthy();
  });

  it("selects from the map", async () => {
    setup();
    await ready();
    act(() => mapProps.onClick({ features: [{ properties: { key: "osmfr:nord_du_quebec" } }], lngLat: { lng: 0, lat: 0 } }));
    expect(within(selectionPanel()).getByText("Nord du Quebec")).toBeTruthy();
  });

  it("highlights the polygon of the list row under the cursor", async () => {
    const { user } = setup();
    await ready();
    await user.hover(listRows()[0]!);
    expect(fakeMap.setFeatureState).toHaveBeenLastCalledWith({ source: "osmfr", id: "osmfr:monaco" }, { selected: false, hover: true });
  });

  it("passes no axe checks with a selection and warning badges", async () => {
    const { user, container } = setup();
    await ready();
    await user.click(listRows()[0]!);
    await user.click(listRows()[1]!);
    expect(within(selectionPanel()).getByText(/No change files/)).toBeTruthy();
    expect(within(selectionPanel()).getByText(/Hourly updates only/)).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("disables a provider with no data and still works", async () => {
    setup(async () => makeAppData(EXTRACTS.filter((e) => e.provider === "geofabrik")));
    await ready();
    expect(screen.getByRole("radio", { name: "OSM-FR (not available yet)" })).toHaveProperty("disabled", true);
    expect(rowNames()).toEqual(["Ontario Geofabrik", "Quebec Geofabrik"]);
  });
});

describe("App keyboard", () => {
  it("reaches every control with Tab, in order", async () => {
    const { user } = setup();
    await ready();
    const stops: string[] = [];
    for (let i = 0; i < 12; i++) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      stops.push(el.getAttribute("aria-label") ?? (el.closest("label")?.textContent || el.textContent || el.tagName).trim());
    }
    expect(stops).toEqual([
      "Source on GitHub ↗(opens in a new tab)",
      "Geofabrik ↗(opens in a new tab)",
      "OpenStreetMap France ↗(opens in a new tab)",
      "Both",
      "Smallest available",
      "INPUT",
      // The sort <select>: its text is its options.
      "NameSize",
      expect.stringContaining("Monaco"),
      expect.stringContaining("Nord du Quebec"),
      expect.stringContaining("Ontario"),
      expect.stringContaining("Quebec"),
      // The map canvas comes after the sidebar.
      "CANVAS",
    ]);
  });

  it("selects and deselects with Enter and Space, and reaches the copy buttons", async () => {
    const { user } = setup();
    await ready();
    listRows()[0]!.focus();
    await user.keyboard("{Enter}");
    expect(listRows()[0]!.getAttribute("aria-pressed")).toBe("true");
    await user.keyboard(" ");
    expect(listRows()[0]!.getAttribute("aria-pressed")).toBe("false");
    await user.keyboard(" ");
    const copy = within(selectionPanel()).getByRole("button", { name: "Copy .pbf URL for Monaco" });
    copy.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(copy.textContent).toBe("Copied"));
  });
});
