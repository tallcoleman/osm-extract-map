import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../test/data.ts";
import { Header } from "./Header.tsx";

describe("Header", () => {
  it("links prominently to both providers", async () => {
    const { container } = render(<Header />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("OSM Extracts Map");
    expect(screen.getByRole("link", { name: "Geofabrik (opens in a new tab)" }).getAttribute("href")).toBe("https://www.geofabrik.de/");
    expect(screen.getByRole("link", { name: "OpenStreetMap France (opens in a new tab)" }).getAttribute("href")).toBe(
      "https://www.openstreetmap.fr/",
    );
    await expectNoAxeViolations(container);
  });
});
