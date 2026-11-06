import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test/helpers.ts";
import {
  DEFAULT_REQUEST_INTERVAL_MS,
  loadUpdaterConfig,
  parseExcludeList,
  parseRequestInterval,
  PROVIDER_HOSTS,
  USER_AGENT,
} from "./config.ts";

describe("config", () => {
  it("builds a User-Agent that points to the public repo", () => {
    expect(USER_AGENT).toMatch(/^osm-extract-map\/\d+\.\d+\.\d+ \(\+https:\/\/github\.com\/tallcoleman\/osm-extract-map\)$/);
  });

  it("allowlists only the two provider download hosts", () => {
    expect(PROVIDER_HOSTS).toEqual(["download.geofabrik.de", "download.openstreetmap.fr"]);
  });
});

describe("loadUpdaterConfig", () => {
  it("loads the committed config files", async () => {
    const config = await loadUpdaterConfig();
    expect(config.osmfrExclude).toEqual([]);
    expect(typeof config.levelOverrides).toBe("object");
  });

  it("loads and checks files from another directory", async () => {
    const tmp = await makeTempDir("config-test-");
    await writeFile(path.join(tmp.dir, "level-overrides.json"), '{"depth": {"geofabrik:russia": 1}, "bundles": ["geofabrik:dach"]}');
    await writeFile(path.join(tmp.dir, "osmfr-exclude.json"), '["europe/france"]');
    expect(await loadUpdaterConfig(tmp.dir)).toEqual({
      levelOverrides: { depth: { "geofabrik:russia": 1 }, bundles: ["geofabrik:dach"] },
      osmfrExclude: ["europe/france"],
    });
    await writeFile(path.join(tmp.dir, "osmfr-exclude.json"), '["../etc"]');
    await expect(loadUpdaterConfig(tmp.dir)).rejects.toThrow(/not an extract path/);
    await tmp.cleanup();
  });
});

describe("parseExcludeList", () => {
  it("accepts extract paths", () => {
    expect(parseExcludeList(["africa", "north-america/us_west", "a/b/c"])).toEqual(["africa", "north-america/us_west", "a/b/c"]);
  });

  it.each([[{}], [["/africa"]], [["africa/"]], [["a/../b"]], [[3]], [["Africa"]], [[""]]])("rejects %j", (value) => {
    expect(() => parseExcludeList(value)).toThrow();
  });
});

describe("parseRequestInterval", () => {
  it("defaults when unset or empty", () => {
    expect(parseRequestInterval(undefined)).toBe(DEFAULT_REQUEST_INTERVAL_MS);
    expect(parseRequestInterval("")).toBe(DEFAULT_REQUEST_INTERVAL_MS);
  });

  it("parses whole milliseconds", () => {
    expect(parseRequestInterval("2500")).toBe(2500);
    expect(parseRequestInterval("0")).toBe(0);
  });

  it.each(["-1", "1.5", "fast"])("rejects %j", (value) => {
    expect(() => parseRequestInterval(value)).toThrow(/REQUEST_INTERVAL_MS/);
  });
});
