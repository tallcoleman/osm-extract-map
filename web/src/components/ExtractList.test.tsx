import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { parentPaths } from "../lib/parents.ts";
import { visibleExtracts } from "../lib/search.ts";
import { EXTRACTS, expectNoAxeViolations } from "../test/data.ts";
import { ExtractList } from "./ExtractList.tsx";

const items = visibleExtracts(EXTRACTS, { providers: ["geofabrik", "osmfr"], level: 3, query: "" });

function setup(overrides: Partial<Parameters<typeof ExtractList>[0]> = {}) {
  const props = {
    items,
    parents: parentPaths(EXTRACTS),
    selected: ["osmfr:monaco"],
    query: "",
    sort: "name" as const,
    onQueryChange: vi.fn(),
    onSortChange: vi.fn(),
    onActivate: vi.fn(),
    onHighlight: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExtractList {...props} />), props };
}

const rows = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));

describe("ExtractList", () => {
  it("lists the extracts, sorted, with selection state and details", async () => {
    const { container } = setup();
    expect(rows().map((r) => r.querySelector(".row-name")!.textContent)).toEqual(["Monaco", "Nord du Quebec", "Ontario", "Quebec"]);
    expect(rows().map((r) => r.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
    expect(rows()[0]!.textContent).toContain("No change files");
    expect(rows()[3]!.textContent).toContain("Geofabrik · 1.2 GB · coarser");
    expect(rows().map((r) => r.querySelector(".row-path")?.textContent ?? null)).toEqual([null, "Canada › Québec", "Canada", "Canada"]);
    expect(screen.getByText("4 extracts")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("sorts by size", () => {
    setup({ sort: "size" });
    expect(rows().map((r) => r.querySelector(".row-name")!.textContent)).toEqual(["Monaco", "Nord du Quebec", "Quebec", "Ontario"]);
  });

  it("reports search and sort changes", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.type(screen.getByRole("searchbox", { name: "Search extracts by name" }), "q");
    expect(props.onQueryChange).toHaveBeenCalledWith("q");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "size");
    expect(props.onSortChange).toHaveBeenCalledWith("size");
  });

  it("shows the query in the count", () => {
    setup({ items: items.slice(0, 1), query: " mon " });
    expect(screen.getByText("1 extract matching “mon”")).toBeTruthy();
  });

  it("selects with click, Enter and Space, and highlights on hover and focus", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(rows()[1]!);
    expect(props.onActivate).toHaveBeenLastCalledWith("osmfr:nord_du_quebec");
    expect(props.onHighlight).toHaveBeenCalledWith("osmfr:nord_du_quebec");
    await user.unhover(rows()[1]!);
    expect(props.onHighlight).toHaveBeenLastCalledWith(null);
    rows()[2]!.focus();
    expect(props.onHighlight).toHaveBeenLastCalledWith("geofabrik:ontario");
    await user.keyboard("{Enter}");
    expect(props.onActivate).toHaveBeenLastCalledWith("geofabrik:ontario");
    await user.tab();
    expect(props.onHighlight).toHaveBeenLastCalledWith("geofabrik:quebec");
    await user.keyboard(" ");
    expect(props.onActivate).toHaveBeenLastCalledWith("geofabrik:quebec");
    rows()[3]!.blur();
    expect(props.onHighlight).toHaveBeenLastCalledWith(null);
  });
});
