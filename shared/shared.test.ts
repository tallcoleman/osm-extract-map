import { describe, expect, it } from "vitest";
import { boundariesFile, PROVIDER_IDS, PROVIDERS } from "./schema.ts";
import { checkAllowedUrl, LINK_HOSTS } from "./urls.ts";

describe("schema", () => {
  it("names boundary files per provider", () => {
    expect(boundariesFile("osmfr")).toBe("boundaries-osmfr.geojson");
  });

  it("has a config for every provider id", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual([...PROVIDER_IDS].sort());
    for (const id of PROVIDER_IDS) expect(PROVIDERS[id].id).toBe(id);
  });
});

describe("LINK_HOSTS", () => {
  it("allows provider download hosts and homepages only", () => {
    expect([...LINK_HOSTS].sort()).toEqual([
      "download.geofabrik.de",
      "download.openstreetmap.fr",
      "www.geofabrik.de",
      "www.openstreetmap.fr",
    ]);
  });

  it("rejects script, data, http and off-host links", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "http://www.geofabrik.de/", "https://evil.example/"]) {
      expect(checkAllowedUrl(url, LINK_HOSTS)).toBeNull();
    }
    expect(checkAllowedUrl("https://www.geofabrik.de/", LINK_HOSTS)).not.toBeNull();
  });
});
