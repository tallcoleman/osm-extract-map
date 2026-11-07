// Golden-file test: runUpdate() in offline mode over the committed fixture
// subset (fixtures/pipeline/) must match fixtures/expected/. After an
// intended output change, run `npx vitest run updater/pipeline.test.ts -u`
// and review the diff.
//
// The coverage gaps use a small made-up "land" box over Quebec instead of the
// real land polygons, which would make the golden file huge.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { makeLogger, makeTempDir, serveFixtureSite } from "../test/helpers.ts";
import type { BoundaryCollection, GapCollection } from "../shared/schema.ts";
import { loadUpdaterConfig, PROVIDER_HOSTS, USER_AGENT } from "./config.ts";
import { HttpClient } from "./http.ts";
import { createFetchers } from "./providers/index.ts";
import { runUpdate } from "./run.ts";

const RECORDED_AT = Date.parse("2026-11-06T16:00:00Z");
const BUILT_AT = new Date("2026-11-06T18:00:00Z");

let cache: Awaited<ReturnType<typeof makeTempDir>>;
let data: Awaited<ReturnType<typeof makeTempDir>>;
beforeEach(async () => {
  cache = await makeTempDir("pipeline-cache-");
  data = await makeTempDir("pipeline-data-");
});
afterEach(async () => {
  await cache.cleanup();
  await data.cleanup();
});

/** One feature per line, so a change to one extract shows up as a one-line diff. */
function formatBoundaries(text: string): string {
  const fc = JSON.parse(text) as BoundaryCollection;
  return `{"type":"FeatureCollection","features":[\n${fc.features.map((f) => JSON.stringify(f)).join(",\n")}\n]}\n`;
}

/** One feature per line, like the boundaries. */
function formatGaps(text: string): string {
  const fc = JSON.parse(text) as GapCollection;
  return `{"type":"FeatureCollection","features":[\n${fc.features.map((f) => JSON.stringify(f)).join(",\n")}\n]}\n`;
}

// The whole pipeline, coverage gaps included, takes about 1 s here but over 5 s
// (vitest's default limit) on a slow or emulated amd64 Docker build.
it("builds the expected release from recorded fixtures", { timeout: 60_000 }, async () => {
  // Record the fixture site into an empty cache, then build offline from it.
  const recorder = new HttpClient({
    cacheDir: cache.dir,
    allowedHosts: PROVIDER_HOSTS,
    userAgent: USER_AGENT,
    mode: "record",
    minIntervalMs: 0,
    now: () => RECORDED_AT,
  });
  for (const url of serveFixtureSite("fixtures/pipeline")) await recorder.get(url);

  const logger = makeLogger();
  const config = await loadUpdaterConfig();
  const { fetchers } = createFetchers({
    mode: "offline",
    cacheDir: cache.dir,
    allowedHosts: PROVIDER_HOSTS,
    userAgent: USER_AGENT,
    requestIntervalMs: 0,
    skipSizes: false,
    osmfrExclude: config.osmfrExclude,
    logger,
  });
  const result = await runUpdate({
    dataDir: data.dir,
    providers: ["geofabrik", "osmfr"],
    fetchers,
    levelOverrides: config.levelOverrides,
    land: [[[[-80, 44], [-57, 44], [-57, 63], [-80, 63], [-80, 44]]]],
    now: () => BUILT_AT,
    logger,
  });
  expect(result.published).toBe(true);

  const read = (name: string) => readFile(path.join(data.dir, "current", name), "utf8");
  const golden = (name: string) => `../fixtures/expected/${name}`;
  await expect(`${await read("meta.json")}\n`).toMatchFileSnapshot(golden("meta.json"));
  await expect(`${JSON.stringify(JSON.parse(await read("extracts.json")), null, 2)}\n`).toMatchFileSnapshot(golden("extracts.json"));
  for (const p of ["geofabrik", "osmfr"]) {
    const name = `boundaries-${p}.geojson`;
    await expect(formatBoundaries(await read(name))).toMatchFileSnapshot(golden(name));
  }
  await expect(formatGaps(await read("gaps.geojson"))).toMatchFileSnapshot(golden("gaps.geojson"));
  const log = logger.lines.map((l) => l.replace(data.dir, "<data>").replace(/computed in [\d.]+s/, "computed in <time>")).join("\n");
  await expect(`${log}\n`).toMatchFileSnapshot(golden("log.txt"));
});
