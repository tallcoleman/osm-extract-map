import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, makeMeta } from "../test/data.ts";
import { Header, REPO_URL } from "./Header.tsx";

describe("Header", () => {
  it("links to the providers with when each was last checked", async () => {
    const { container } = render(<Header meta={makeMeta()} failed={[]} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("OSM Extracts Map");
    expect(screen.getByRole("link", { name: "Source on GitHub (opens in a new tab)" }).getAttribute("href")).toBe(REPO_URL);
    const list = screen.getByRole("list", { name: "Providers:" });
    expect(within(list).getByRole("link", { name: "Geofabrik (opens in a new tab)" }).getAttribute("href")).toBe("https://www.geofabrik.de/");
    expect(within(list).getByRole("link", { name: "OpenStreetMap France (opens in a new tab)" }).getAttribute("href")).toBe(
      "https://www.openstreetmap.fr/",
    );
    const items = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      expect.stringMatching(/^Geofabrik ↗.*\(last checked .*2026\)$/),
      expect.stringMatching(/^OpenStreetMap France ↗.*\(last checked .*2026\)$/),
    ]);
    expect(screen.queryByText(/out of date|failed/)).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("flags stale, missing and failed providers", async () => {
    const meta = makeMeta({ providers: { geofabrik: { extractCount: 4, fetchedAt: "2026-11-06T00:00:00Z", status: "stale" } } });
    const { container } = render(<Header meta={meta} failed={["geofabrik"]} />);
    const [geofabrik, osmfr] = screen.getAllByRole("listitem");
    expect(geofabrik!.textContent).toContain("Last update failed; may be out of date");
    expect(geofabrik!.textContent).toContain("Boundaries failed to load");
    expect(osmfr!.textContent).toMatch(/\(no data yet\)$/);
    await expectNoAxeViolations(container);
  });

  it("leaves out the dates while the data is loading", () => {
    render(<Header />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Geofabrik ↗(opens in a new tab)",
      "OpenStreetMap France ↗(opens in a new tab)",
    ]);
  });
});
