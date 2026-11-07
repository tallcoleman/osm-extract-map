import { describe, expect, it } from "vitest";
import { safeHref } from "./safe-href.ts";

describe("safeHref", () => {
  it.each([
    "https://download.geofabrik.de/europe/monaco.html",
    "https://download.openstreetmap.fr/extracts/europe/",
    "https://www.geofabrik.de/",
    "https://www.openstreetmap.fr/",
  ])("allows %s", (url) => {
    expect(safeHref(url)).toBe(url);
  });

  it.each([
    null,
    undefined,
    "",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "http://download.geofabrik.de/europe/monaco.html",
    "https://evil.example/",
    "https://download.geofabrik.de.evil.example/",
    "https://user@download.geofabrik.de/",
    "https://download.geofabrik.de:8443/",
    "//download.geofabrik.de/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(safeHref(url)).toBeNull();
  });
});
