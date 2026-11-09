import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocodeOptions, Place } from "../lib/geocode.ts";
import { expectNoAxeViolations } from "../test/data.ts";
import { PlaceSearch, SEARCH_DELAY_MS } from "./PlaceSearch.tsx";

const LAVAL_QC: Place = { label: "Laval", detail: "Québec, Canada", center: [-73.72, 45.56], bbox: [-73.9, 45.5, -73.5, 45.7] };
const LAVAL_FR: Place = { label: "Laval", detail: "Pays de la Loire, France", center: [-0.77, 48.07], bbox: null };

// Time also passes normally, since Testing Library waits on a real setTimeout(0)
// after each user-event action. The debounce is still stepped through by hand.
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

function setup(geocode = vi.fn(async (_q: string, _o: GeocodeOptions) => [LAVAL_QC, LAVAL_FR])) {
  const onSelect = vi.fn();
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  const view = render(<PlaceSearch onSelect={onSelect} geocode={geocode} />);
  const input = screen.getByRole("combobox", { name: "Find a place" });
  return { ...view, user, input, onSelect, geocode };
}

/** Lets the debounce run and the geocode promise settle. */
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(SEARCH_DELAY_MS)));

describe("PlaceSearch", () => {
  it("searches once typing pauses, not on every key", async () => {
    const { user, input, geocode } = setup();
    await user.type(input, "La");
    await settle();
    expect(geocode).not.toHaveBeenCalled();
    await user.type(input, "val");
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);
    expect(geocode.mock.calls[0]![0]).toBe("Laval");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["LavalQuébec, Canada", "LavalPays de la Loire, France"]);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("2 places");
  });

  it("aborts a search that's been overtaken", async () => {
    let first: AbortSignal | undefined;
    const geocode = vi.fn((q: string, o: GeocodeOptions) => {
      if (q === "Lava") first = o.signal;
      return q === "Lava" ? new Promise<Place[]>(() => {}) : Promise.resolve([LAVAL_QC]);
    });
    const { user, input } = setup(geocode);
    await user.type(input, "Lava");
    await settle();
    await user.type(input, "l");
    await settle();
    expect(first?.aborted).toBe(true);
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("picks a place with the arrow keys and Enter", async () => {
    const { user, input, onSelect, geocode } = setup();
    await user.type(input, "Laval");
    await settle();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1]!.id);
    // Wraps round past the last option and back.
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(LAVAL_FR);
    expect(input).toHaveProperty("value", "Laval");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    // Putting the name in the box doesn't search again.
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it("picks a place with a click", async () => {
    const { user, input, onSelect } = setup();
    await user.type(input, "Laval");
    await settle();
    await user.click(screen.getByRole("option", { name: /Québec/ }));
    expect(onSelect).toHaveBeenCalledWith(LAVAL_QC);
  });

  it("searches straight away on Enter", async () => {
    const { user, input, geocode } = setup();
    await user.type(input, "Rio{Enter}");
    expect(geocode).toHaveBeenCalledTimes(1);
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape, then clears", async () => {
    const { user, input } = setup();
    await user.type(input, "Laval");
    await settle();
    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input).toHaveProperty("value", "Laval");
    await user.keyboard("{Escape}");
    expect(input).toHaveProperty("value", "");
  });

  it("says when nothing is found", async () => {
    const { user, input } = setup(vi.fn(async () => []));
    await user.type(input, "Xyzzy");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("No places found.");
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("says when the search fails", async () => {
    const { user, input } = setup(vi.fn(async () => Promise.reject(new Error("HTTP 429"))));
    await user.type(input, "Laval");
    await settle();
    expect(screen.getByRole("status").textContent).toBe("Place search isn't available right now.");
  });

  it("passes axe checks with results open", async () => {
    const { user, input, container } = setup();
    await user.type(input, "Laval");
    await settle();
    await user.keyboard("{ArrowDown}");
    vi.useRealTimers();
    await expectNoAxeViolations(container);
  });
});
