import { describe, expect, it } from "vitest";
import { checkAllowedUrl, LINK_HOSTS } from "../../../shared/urls.ts";
import { choiceLabel, PROVIDER_ATTRIBUTION, providerOfKey, visibleProviders } from "./providers.ts";

describe("visibleProviders", () => {
  it("follows the choice, limited to providers with data", () => {
    expect(visibleProviders("both", ["geofabrik", "osmfr"])).toEqual(["geofabrik", "osmfr"]);
    expect(visibleProviders("osmfr", ["geofabrik", "osmfr"])).toEqual(["osmfr"]);
    expect(visibleProviders("both", ["geofabrik"])).toEqual(["geofabrik"]);
    expect(visibleProviders("osmfr", ["geofabrik"])).toEqual([]);
  });
});

describe("providerOfKey", () => {
  it("reads the provider prefix", () => {
    expect(providerOfKey("osmfr:europe/france")).toBe("osmfr");
    expect(providerOfKey("geofabrik:us/alabama")).toBe("geofabrik");
    expect(providerOfKey("other:x")).toBeNull();
    expect(providerOfKey("geofabrik")).toBeNull();
  });
});

describe("labels and attribution", () => {
  it("labels choices", () => {
    expect(["both", "geofabrik", "osmfr"].map((c) => choiceLabel(c as never))).toEqual(["Both", "Geofabrik", "OSM-FR"]);
  });

  it("links attribution only to provider homepages", () => {
    for (const html of Object.values(PROVIDER_ATTRIBUTION)) {
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
      expect(hrefs).toHaveLength(1);
      for (const h of hrefs) expect(checkAllowedUrl(h, LINK_HOSTS)).not.toBeNull();
    }
  });
});
