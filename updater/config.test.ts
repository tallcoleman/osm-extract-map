import { describe, expect, it } from "vitest";
import { PROVIDER_HOSTS, USER_AGENT } from "./config.ts";

describe("config", () => {
  it("builds a User-Agent that points to the public repo", () => {
    expect(USER_AGENT).toMatch(/^osm-extract-map\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/tallcoleman\/osm-extract-map\)$/);
  });

  it("allowlists only the two provider download hosts", () => {
    expect(PROVIDER_HOSTS).toEqual(["download.geofabrik.de", "download.openstreetmap.fr"]);
  });
});
