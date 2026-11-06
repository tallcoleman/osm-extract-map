import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLogger, makeTempDir } from "../../test/helpers.ts";
import { HttpError } from "../http.ts";
import { createFetchers, type FetcherSettings, httpOptionsFor, OSMFR_MIN_INTERVAL_MS } from "./index.ts";

let tmp: Awaited<ReturnType<typeof makeTempDir>>;
beforeEach(async () => {
  tmp = await makeTempDir("fetchers-test-");
});
afterEach(() => tmp.cleanup());

const settings = (overrides: Partial<FetcherSettings> = {}): FetcherSettings => ({
  mode: "offline",
  cacheDir: tmp.dir,
  allowedHosts: ["download.geofabrik.de", "download.openstreetmap.fr"],
  userAgent: "test",
  requestIntervalMs: 500,
  skipSizes: true,
  osmfrExclude: [],
  logger: makeLogger(),
  ...overrides,
});

describe("httpOptionsFor", () => {
  it("uses the configured interval and default retries for Geofabrik", () => {
    const opts = httpOptionsFor("geofabrik", settings());
    expect(opts.minIntervalMs).toBe(500);
    expect(opts.maxRetries).toBeUndefined();
  });

  it("always spaces OSM-FR requests by at least 2s and never retries", () => {
    expect(httpOptionsFor("osmfr", settings({ requestIntervalMs: 0 }))).toMatchObject({
      minIntervalMs: OSMFR_MIN_INTERVAL_MS,
      maxRetries: 0,
    });
    expect(httpOptionsFor("osmfr", settings({ requestIntervalMs: 5000 })).minIntervalMs).toBe(5000);
    expect(OSMFR_MIN_INTERVAL_MS).toBe(2000);
  });
});

describe("createFetchers", () => {
  it("builds a fetcher per provider on its own client", async () => {
    const { fetchers, clients } = createFetchers(settings());
    expect(clients.geofabrik).not.toBe(clients.osmfr);
    // Offline with an empty cache: each fetcher fails on its first request.
    await expect(fetchers.geofabrik()).rejects.toMatchObject({ code: "offline-miss", url: "https://download.geofabrik.de/index-v1.json" });
    await expect(fetchers.osmfr()).rejects.toSatisfy(
      (e) => e instanceof HttpError && e.url === "https://download.openstreetmap.fr/extracts/",
    );
  });
});
