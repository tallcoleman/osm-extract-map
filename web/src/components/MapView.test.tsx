import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GapCollection } from "../../../shared/schema.ts";
import { HATCH_IMAGE } from "../lib/hatch.ts";
import { levelFilters } from "../lib/levels.ts";
import { PROVIDER_ATTRIBUTION } from "../lib/providers.ts";
import { EXTRACTS, makeAppData } from "../test/data.ts";
import { addSource, dropSource, fakeMap, mapProps, resetMapMock } from "../test/map-mock.tsx";
import { GAPS_LAYER, HOVER_DELAY_MS, MapView, type MapViewProps } from "./MapView.tsx";

vi.mock("react-map-gl/maplibre", () => import("../test/map-mock.tsx"));

const data = makeAppData();
const byKey = new Map(EXTRACTS.map((e) => [e.key, e]));

function setup(overrides: Partial<MapViewProps> = {}) {
  const props: MapViewProps = {
    styleUrl: "https://example.test/style.json",
    boundaries: data.boundaries,
    providers: ["geofabrik", "osmfr"],
    level: "smallest",
    selected: [],
    highlighted: null,
    extractsByKey: byKey,
    zoomTo: null,
    gaps: null,
    onToggle: vi.fn(),
    ...overrides,
  };
  const view = render(<MapView {...props} />);
  return { ...view, props, update: (next: Partial<MapViewProps>) => view.rerender(<MapView {...props} {...next} />) };
}

const layer = (id: string) => document.querySelector<HTMLElement>(`[data-layer="${id}"]`)!;
const filterOf = (id: string) => JSON.parse(layer(id).dataset.filter!);
const feature = (key: string) => ({ properties: { key } });
const mouseEvent = (keys: string[], x = 100, y = 100) => ({
  features: keys.map(feature),
  point: { x, y },
  lngLat: { lng: 5, lat: 45 },
  target: { getContainer: () => ({ clientWidth: 800, clientHeight: 600 }) },
});

beforeEach(resetMapMock);
afterEach(() => vi.useRealTimers());

describe("MapView layers", () => {
  it("adds one source per provider, with attribution and key ids", () => {
    setup();
    for (const p of ["geofabrik", "osmfr"] as const) {
      const source = document.querySelector<HTMLElement>(`[data-source="${p}"]`)!;
      expect(source.dataset.attribution).toBe(PROVIDER_ATTRIBUTION[p]);
      expect(source.dataset.promoteId).toBe("key");
      expect([...source.querySelectorAll<HTMLElement>("[data-layer]")].map((l) => l.dataset.layer)).toEqual([
        `${p}-fill`,
        `${p}-coarser`,
        `${p}-line`,
        `${p}-selected`,
      ]);
    }
    expect(mapProps.mapStyle).toBe("https://example.test/style.json");
  });

  it("skips providers with no boundaries", () => {
    setup({ boundaries: { osmfr: data.boundaries.osmfr }, providers: ["osmfr"] });
    expect(document.querySelector('[data-source="geofabrik"]')).toBeNull();
  });

  it("applies the level filters, and changes them with the level", () => {
    const { update } = setup();
    const smallest = levelFilters("smallest");
    expect(filterOf("osmfr-fill")).toEqual(smallest.any);
    expect(filterOf("osmfr-line")).toEqual(smallest.normal);
    expect(filterOf("osmfr-coarser")).toEqual(smallest.coarser);
    update({ level: 2 });
    expect(filterOf("geofabrik-fill")).toEqual(levelFilters(2).any);
    expect(filterOf("geofabrik-coarser")).toEqual(levelFilters(2).coarser);
  });

  it("hides providers that aren't shown and only makes shown ones clickable", () => {
    setup({ providers: ["osmfr"] });
    expect(layer("geofabrik-line").dataset.visibility).toBe("none");
    expect(layer("osmfr-line").dataset.visibility).toBe("visible");
    expect(mapProps.interactiveLayerIds).toEqual(["osmfr-fill"]);
  });

  it("outlines each provider's selected extracts, at every level", () => {
    setup({ selected: ["osmfr:monaco", "geofabrik:quebec", "osmfr:canada"] });
    expect(filterOf("osmfr-selected")).toEqual(["in", ["get", "key"], ["literal", ["osmfr:monaco", "osmfr:canada"]]]);
    expect(filterOf("geofabrik-selected")).toEqual(["in", ["get", "key"], ["literal", ["geofabrik:quebec"]]]);
  });

  it("styles coarser outlines dashed and fainter", () => {
    setup({ level: 3 });
    const paint = JSON.parse(layer("osmfr-coarser").dataset.paint!);
    expect(paint["line-dasharray"]).toEqual([3, 2]);
    expect(paint["line-opacity"]).toEqual(["case", ["boolean", ["feature-state", "hover"], false], 1, 0.55]);
  });
});

describe("MapView feature state", () => {
  const calls = () => fakeMap.setFeatureState.mock.calls.map(([f, s]) => [f.id, s]);

  it("marks selected and highlighted extracts, and clears them again", () => {
    const { update } = setup({ selected: ["osmfr:monaco"] });
    expect(calls()).toEqual([["osmfr:monaco", { selected: true, hover: false }]]);
    fakeMap.setFeatureState.mockClear();
    update({ selected: ["osmfr:monaco"], highlighted: "geofabrik:quebec" });
    expect(calls()).toEqual([["geofabrik:quebec", { selected: false, hover: true }]]);
    fakeMap.setFeatureState.mockClear();
    update({ selected: [], highlighted: null });
    expect(calls()).toEqual([
      ["osmfr:monaco", { selected: false, hover: false }],
      ["geofabrik:quebec", { selected: false, hover: false }],
    ]);
  });

  it("waits for a source, then sends its state when the source is added", () => {
    const { update } = setup();
    dropSource("osmfr");
    update({ selected: ["osmfr:monaco", "geofabrik:quebec", "bad-key"] });
    expect(calls()).toEqual([["geofabrik:quebec", { selected: true, hover: false }]]);
    fakeMap.setFeatureState.mockClear();
    addSource("osmfr");
    act(() => mapProps.onSourceData({ sourceId: "osmfr", sourceDataType: "content" }));
    act(() => mapProps.onSourceData({ sourceId: "other", sourceDataType: "metadata" }));
    expect(calls()).toEqual([]);
    act(() => mapProps.onSourceData({ sourceId: "osmfr", sourceDataType: "metadata" }));
    expect(calls()).toEqual([["osmfr:monaco", { selected: true, hover: false }]]);
  });

  it("sends a re-added source's state again", () => {
    setup({ selected: ["osmfr:monaco", "geofabrik:quebec"] });
    fakeMap.setFeatureState.mockClear();
    act(() => mapProps.onSourceData({ sourceId: "osmfr", sourceDataType: "metadata" }));
    expect(calls()).toEqual([["osmfr:monaco", { selected: true, hover: false }]]);
  });
});

describe("MapView pointer", () => {
  it("toggles the extract under a click", () => {
    const { props } = setup();
    act(() => mapProps.onClick(mouseEvent(["osmfr:monaco"])));
    expect(props.onToggle).toHaveBeenCalledWith("osmfr:monaco");
    act(() => mapProps.onClick(mouseEvent([])));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("opens the overlap picker when several extracts are under a click", async () => {
    const user = userEvent.setup();
    const { props } = setup({ selected: ["geofabrik:quebec"] });
    act(() => mapProps.onClick(mouseEvent(["geofabrik:canada", "osmfr:nord_du_quebec", "geofabrik:quebec"])));
    const dialog = screen.getByRole("dialog", { name: "3 extracts here" });
    expect(screen.getByTestId("popup").dataset.lnglat).toBe("5,45");
    const choices = screen.getAllByRole("button", { pressed: undefined }).filter((b) => b.hasAttribute("aria-pressed"));
    expect(choices.map((b) => b.textContent)).toEqual([
      expect.stringContaining("Nord du Quebec"),
      expect.stringContaining("Quebec"),
      expect.stringContaining("Canada"),
    ]);
    expect(choices[1]).toHaveProperty("ariaPressed", "true");
    expect(document.activeElement).toBe(choices[0]);
    await user.click(choices[2]!);
    expect(props.onToggle).toHaveBeenCalledWith("geofabrik:canada");
    expect(dialog.isConnected).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(fakeMap.getCanvas());
  });

  it("closes the picker with its close button, or a click elsewhere", async () => {
    const user = userEvent.setup();
    setup();
    act(() => mapProps.onClick(mouseEvent(["geofabrik:canada", "geofabrik:quebec"])));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => mapProps.onClick(mouseEvent(["geofabrik:canada", "geofabrik:quebec"])));
    act(() => mapProps.onClick(mouseEvent([])));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows a tooltip after the cursor settles, and highlights what's under it", () => {
    vi.useFakeTimers();
    setup();
    act(() => mapProps.onMouseMove(mouseEvent(["osmfr:monaco"], 120, 80)));
    expect(document.querySelector(".map-tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    const tip = document.querySelector<HTMLElement>(".map-tooltip")!;
    expect(tip.textContent).toBe("Monaco · OSM-FR · 2.0 MB");
    expect(tip.getAttribute("aria-hidden")).toBe("true");
    expect(tip.style.left).toBe("134px");
    expect(mapProps.cursor).toBe("pointer");
    expect(fakeMap.setFeatureState).toHaveBeenLastCalledWith({ source: "osmfr", id: "osmfr:monaco" }, { selected: false, hover: true });

    // Moving within the same extract changes nothing.
    fakeMap.setFeatureState.mockClear();
    act(() => mapProps.onMouseMove(mouseEvent(["osmfr:monaco"], 130, 80)));
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(fakeMap.setFeatureState).not.toHaveBeenCalled();

    act(() => mapProps.onMouseMove(mouseEvent([], 130, 80)));
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(document.querySelector(".map-tooltip")).toBeNull();
    expect(mapProps.cursor).toBe("grab");
  });

  it("hides the tooltip when the cursor leaves the map", () => {
    vi.useFakeTimers();
    setup();
    act(() => mapProps.onMouseMove(mouseEvent(["osmfr:monaco"])));
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    act(() => mapProps.onMouseMove(mouseEvent(["geofabrik:quebec"])));
    act(() => mapProps.onMouseLeave());
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(document.querySelector(".map-tooltip")).toBeNull();
  });

  it("hides the tooltip when the map moves, and pauses hover until it stops", () => {
    vi.useFakeTimers();
    setup();
    act(() => mapProps.onMouseMove(mouseEvent(["osmfr:monaco"])));
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(document.querySelector(".map-tooltip")).not.toBeNull();
    act(() => mapProps.onMoveStart());
    expect(document.querySelector(".map-tooltip")).toBeNull();
    expect(mapProps.cursor).toBe("grab");
    act(() => mapProps.onMouseMove(mouseEvent(["osmfr:monaco"])));
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(document.querySelector(".map-tooltip")).toBeNull();
    act(() => mapProps.onMoveEnd());
    act(() => mapProps.onMouseMove(mouseEvent(["osmfr:monaco"])));
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(document.querySelector(".map-tooltip")).not.toBeNull();
  });

  it("has a control to show the user's location", () => {
    setup();
    expect(screen.getByTestId("geolocate").dataset.position).toBe("top-right");
  });

  it("hides the tooltip while the picker is open", () => {
    vi.useFakeTimers();
    setup();
    act(() => mapProps.onMouseMove(mouseEvent(["geofabrik:canada", "geofabrik:quebec"])));
    act(() => vi.advanceTimersByTime(HOVER_DELAY_MS));
    expect(document.querySelector(".map-tooltip")!.textContent).toContain("Click to choose");
    act(() => mapProps.onClick(mouseEvent(["geofabrik:canada", "geofabrik:quebec"])));
    expect(document.querySelector(".map-tooltip")).toBeNull();
  });

  it("hatches the gaps for the providers and level shown, once the pattern is registered", () => {
    const gaps: GapCollection = { type: "FeatureCollection", features: [] };
    const { update } = setup({ gaps, providers: ["osmfr"], level: 1 });
    expect(document.querySelector('[data-source="gaps"]')).toBeNull();
    act(() => mapProps.onLoad());
    expect(fakeMap.addImage).toHaveBeenCalledWith(HATCH_IMAGE, expect.objectContaining({ width: 16, height: 16 }), { pixelRatio: 2 });
    expect(JSON.parse(layer(GAPS_LAYER).dataset.paint!)).toEqual({ "fill-pattern": HATCH_IMAGE });
    expect(filterOf(GAPS_LAYER)).toEqual(["all", ["==", ["get", "providers"], "osmfr"], ["==", ["get", "level"], 1]]);
    update({ providers: ["geofabrik", "osmfr"], level: "smallest" });
    expect(filterOf(GAPS_LAYER)).toEqual(["all", ["==", ["get", "providers"], "geofabrik+osmfr"], ["==", ["get", "level"], "smallest"]]);
    update({ gaps: null });
    expect(document.querySelector('[data-source="gaps"]')).toBeNull();
  });

  it("registers the hatch pattern only once", () => {
    setup();
    fakeMap.hasImage.mockReturnValue(true);
    act(() => mapProps.onLoad());
    expect(fakeMap.addImage).not.toHaveBeenCalled();
  });

  it("records performance marks on load and first idle", () => {
    setup();
    performance.clearMarks();
    act(() => mapProps.onLoad());
    mapProps.onIdle();
    mapProps.onIdle();
    expect(performance.getEntriesByName("map-load")).toHaveLength(1);
    expect(performance.getEntriesByName("map-idle")).toHaveLength(1);
  });
});

describe("MapView zoom", () => {
  it("fits the map to a requested extract", () => {
    const { update } = setup();
    expect(fakeMap.fitBounds).not.toHaveBeenCalled();
    update({ zoomTo: { bbox: [1, 2, 3, 4], id: 1 } });
    expect(fakeMap.fitBounds).toHaveBeenCalledWith(
      [
        [1, 2],
        [3, 4],
      ],
      { padding: 40, maxZoom: 10, duration: 800 },
    );
  });

  it("doesn't animate with reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    try {
      setup({ zoomTo: { bbox: [1, 2, 3, 4], id: 1 } });
      expect(fakeMap.fitBounds.mock.calls[0]![1].duration).toBe(0);
    } finally {
      // @ts-expect-error jsdom has no matchMedia
      delete window.matchMedia;
    }
  });
});
