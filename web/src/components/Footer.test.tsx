import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations, makeMeta } from "../test/data.ts";
import { Footer, REPO_URL } from "./Footer.tsx";

describe("Footer", () => {
  it("shows when each provider's data was fetched", async () => {
    const { container } = render(<Footer meta={makeMeta()} failed={[]} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([expect.stringMatching(/^Geofabrik data from .*2026$/), expect.stringMatching(/^OSM-FR data from .*2026$/)]);
    expect(screen.getByRole("link", { name: "Source on GitHub" }).getAttribute("href")).toBe(REPO_URL);
    expect(screen.queryByText(/out of date|failed/)).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("flags stale, missing and failed providers", async () => {
    const meta = makeMeta({ providers: { geofabrik: { extractCount: 4, fetchedAt: "2026-11-06T00:00:00Z", status: "stale" } } });
    const { container } = render(<Footer meta={meta} failed={["geofabrik"]} />);
    const [geofabrik, osmfr] = screen.getAllByRole("listitem");
    expect(geofabrik!.textContent).toContain("Last update failed; may be out of date");
    expect(geofabrik!.textContent).toContain("Boundaries failed to load");
    expect(osmfr!.textContent).toBe("OSM-FR data isn't available yet.");
    await expectNoAxeViolations(container);
  });
});
