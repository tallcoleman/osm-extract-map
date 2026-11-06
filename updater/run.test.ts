import { readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLogger, makeTempDir } from "../test/helpers.ts";
import type { BoundaryCollection, BoundaryGeometry, Extract, Meta, ProviderId } from "../shared/schema.ts";
import type { ExtractDraft, ProviderData } from "./providers/types.ts";
import { acquireLock, type Fetcher, LockError, runUpdate, type RunDeps, STALE_LOCK_MS } from "./run.ts";

let tmp: Awaited<ReturnType<typeof makeTempDir>>;
beforeEach(async () => {
  tmp = await makeTempDir("run-test-");
});
afterEach(() => tmp.cleanup());

const square: BoundaryGeometry = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
const HOSTS = { geofabrik: "https://download.geofabrik.de", osmfr: "https://download.openstreetmap.fr" };

function draft(provider: ProviderId, id: string, parent: string | null, intervals: ExtractDraft["replication"]["intervals"]) {
  return {
    key: `${provider}:${id}`,
    provider,
    id,
    name: id,
    parentKey: parent === null ? null : `${provider}:${parent}`,
    sizeBytes: 100,
    sizeCheckedAt: "2026-11-01T00:00:00.000Z",
    urls: { page: `${HOSTS[provider]}/${id}`, pbf: null, poly: null, replication: null },
    replication: { available: intervals.length > 0, intervals },
  } satisfies ExtractDraft;
}

function providerData(extracts: ExtractDraft[], fetchedAt = "2026-11-05T00:00:00.000Z"): ProviderData {
  return { extracts, geometries: new Map(extracts.map((e) => [e.key, square])), fetchedAt };
}

const geofabrik = (fetchedAt?: string) =>
  providerData(
    // Out of order on purpose: the release sorts by key.
    [draft("geofabrik", "russia", null, []), draft("geofabrik", "monaco", "europe", ["day"]), draft("geofabrik", "europe", null, ["day"])],
    fetchedAt,
  );
const osmfr = () =>
  providerData([draft("osmfr", "europe", null, ["minute"]), draft("osmfr", "europe/zug", "europe", ["hour"])], "2026-11-04T00:00:00.000Z");

let clock = 0;
function deps(overrides: Partial<RunDeps> & { fetchers: RunDeps["fetchers"] }): RunDeps & { logger: ReturnType<typeof makeLogger> } {
  return {
    dataDir: tmp.dir,
    providers: ["geofabrik"],
    now: () => new Date(Date.UTC(2026, 10, 6, 12, 0, clock++)),
    logger: makeLogger(),
    ...overrides,
  } as RunDeps & { logger: ReturnType<typeof makeLogger> };
}

const ok = (data: ProviderData): Fetcher => async () => data;
const failing: Fetcher = async () => {
  throw new Error("connection refused");
};

async function readRelease() {
  const dir = path.join(tmp.dir, "current");
  const meta = JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")) as Meta;
  const extracts = JSON.parse(await readFile(path.join(dir, "extracts.json"), "utf8")) as Extract[];
  const boundaries = async (p: ProviderId) =>
    JSON.parse(await readFile(path.join(dir, `boundaries-${p}.geojson`), "utf8")) as BoundaryCollection;
  return { meta, extracts, boundaries, link: await readlink(dir) };
}

/** Publishes a release with both providers, to start from. */
async function seedBoth() {
  const r = await runUpdate(deps({ providers: ["geofabrik", "osmfr"], fetchers: { geofabrik: ok(geofabrik()), osmfr: ok(osmfr()) } }));
  expect(r.published).toBe(true);
  return readRelease();
}

describe("runUpdate", () => {
  it("publishes fetched providers with levels, leaf flags and replication status", async () => {
    const d = deps({ providers: ["geofabrik", "osmfr"], fetchers: { geofabrik: ok(geofabrik()), osmfr: ok(osmfr()) } });
    const result = await runUpdate(d);
    expect(result).toMatchObject({ published: true, reason: null });

    const { meta, extracts, boundaries } = await readRelease();
    expect(result.meta).toEqual(meta);
    expect(meta).toEqual({
      generatedAt: expect.any(String),
      schemaVersion: 1,
      providers: {
        geofabrik: { extractCount: 3, fetchedAt: "2026-11-05T00:00:00.000Z", status: "ok" },
        osmfr: { extractCount: 2, fetchedAt: "2026-11-04T00:00:00.000Z", status: "ok" },
      },
      files: {
        extracts: "extracts.json",
        boundaries: { geofabrik: "boundaries-geofabrik.geojson", osmfr: "boundaries-osmfr.geojson" },
      },
    });
    expect(extracts.map((e) => [e.key, e.depth, e.isLeaf, e.replication.status])).toEqual([
      ["geofabrik:europe", 0, false, "expected"],
      ["geofabrik:monaco", 1, true, "expected"],
      ["geofabrik:russia", 0, true, "none"],
      ["osmfr:europe", 0, false, "expected"],
      ["osmfr:europe/zug", 1, true, "differs"],
    ]);
    const osmfrBoundaries = await boundaries("osmfr");
    expect(osmfrBoundaries.features.map((f) => f.properties)).toEqual([
      { key: "osmfr:europe", depth: 0, isLeaf: false, name: "europe" },
      { key: "osmfr:europe/zug", depth: 1, isLeaf: true, name: "europe/zug" },
    ]);
    expect(osmfrBoundaries.features[0]!.geometry).toEqual(square);
  });

  it("applies level overrides for each provider", async () => {
    const d = deps({ fetchers: { geofabrik: ok(geofabrik()) }, levelOverrides: { "geofabrik:russia": 1, "osmfr:europe": 3 } });
    await runUpdate(d);
    const { extracts } = await readRelease();
    expect(extracts.find((e) => e.key === "geofabrik:russia")!.depth).toBe(1);
  });

  it("never calls a provider that wasn't requested, and carries it over unchanged", async () => {
    const before = await seedBoth();
    const osmfrFetcher = vi.fn(ok(osmfr()));
    const d = deps({ fetchers: { geofabrik: ok(geofabrik("2026-11-06T00:00:00.000Z")), osmfr: osmfrFetcher } });
    await runUpdate(d);

    expect(osmfrFetcher).not.toHaveBeenCalled();
    const after = await readRelease();
    expect(after.link).not.toBe(before.link);
    expect(after.meta.providers.osmfr).toEqual(before.meta.providers.osmfr);
    expect(after.meta.providers.geofabrik!.fetchedAt).toBe("2026-11-06T00:00:00.000Z");
    expect(after.extracts.filter((e) => e.provider === "osmfr")).toEqual(before.extracts.filter((e) => e.provider === "osmfr"));
    expect(await after.boundaries("osmfr")).toEqual(await before.boundaries("osmfr"));
    expect(d.logger.find("OpenStreetMap France: not requested, carried over")).toHaveLength(1);
  });

  it("leaves out a provider that wasn't requested and isn't in the previous release", async () => {
    await runUpdate(deps({ fetchers: { geofabrik: ok(geofabrik()) } }));
    const { meta } = await readRelease();
    expect(Object.keys(meta.providers)).toEqual(["geofabrik"]);
    expect(Object.keys(meta.files.boundaries)).toEqual(["geofabrik"]);
  });

  it("reuses a failed provider's previous data, marked stale, and keeps it stale when carried over", async () => {
    const before = await seedBoth();
    const d = deps({ providers: ["geofabrik", "osmfr"], fetchers: { geofabrik: ok(geofabrik()), osmfr: failing } });
    expect((await runUpdate(d)).published).toBe(true);
    const after = await readRelease();
    expect(after.meta.providers.osmfr).toEqual({ ...before.meta.providers.osmfr, status: "stale" });
    expect(after.extracts.filter((e) => e.provider === "osmfr")).toHaveLength(2);
    expect(d.logger.find("OpenStreetMap France: fetch failed: connection refused")).toHaveLength(1);
    expect(d.logger.find("marked stale")).toHaveLength(1);

    await runUpdate(deps({ fetchers: { geofabrik: ok(geofabrik()) } }));
    expect((await readRelease()).meta.providers.osmfr!.status).toBe("stale");
  });

  it("leaves out a failed provider with no previous data", async () => {
    const d = deps({ providers: ["geofabrik", "osmfr"], fetchers: { geofabrik: ok(geofabrik()), osmfr: failing } });
    await runUpdate(d);
    expect(Object.keys((await readRelease()).meta.providers)).toEqual(["geofabrik"]);
    expect(d.logger.find("no previous data, left out")).toHaveLength(1);
  });

  it("keeps the current release when every requested provider fails", async () => {
    const before = await seedBoth();
    const d = deps({ providers: ["geofabrik", "osmfr"], fetchers: { geofabrik: failing, osmfr: failing } });
    expect(await runUpdate(d)).toEqual({ published: false, releaseDir: null, meta: null, reason: "no requested provider could be fetched" });
    expect((await readRelease()).link).toBe(before.link);
  });

  it("keeps the current release when validation fails", async () => {
    const before = await seedBoth();
    const shrunk = providerData([draft("geofabrik", "europe", null, ["day"])]);
    const d = deps({ fetchers: { geofabrik: ok(shrunk) } });
    const result = await runUpdate(d);
    expect(result).toMatchObject({ published: false, reason: "Geofabrik: 1 extracts, down from 3" });
    expect((await readRelease()).link).toBe(before.link);
    expect(d.logger.find("Validation failed, keeping the current release")).toHaveLength(1);
  });

  it("treats a bad level override as a validation failure", async () => {
    const result = await runUpdate(deps({ fetchers: { geofabrik: ok(geofabrik()) }, levelOverrides: { "geofabrik:atlantis": 1 } }));
    expect(result).toMatchObject({ published: false, reason: 'level override for missing extract "geofabrik:atlantis"' });
  });

  it("rethrows unexpected errors and releases the lock", async () => {
    const broken = ok({} as ProviderData);
    await expect(runUpdate(deps({ fetchers: { geofabrik: broken } }))).rejects.toThrow(TypeError);
    expect((await runUpdate(deps({ fetchers: { geofabrik: ok(geofabrik()) } }))).published).toBe(true);
  });

  it("requires a fetcher for each requested provider", async () => {
    await expect(runUpdate(deps({ providers: ["osmfr"], fetchers: {} }))).rejects.toThrow(/No fetcher for provider "osmfr"/);
  });

  it("refuses to run while another run holds the lock", async () => {
    const release = await acquireLock(tmp.dir, new Date(), makeLogger());
    await expect(runUpdate(deps({ fetchers: { geofabrik: ok(geofabrik()) } }))).rejects.toThrow(LockError);
    await release();
  });

  it("uses the real clock by default", async () => {
    const d = deps({ fetchers: { geofabrik: ok(geofabrik()) } });
    delete d.now;
    const result = await runUpdate(d);
    expect(Date.parse(result.meta!.generatedAt)).toBeGreaterThan(Date.parse("2026-01-01"));
  });
});

describe("acquireLock", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const lockFile = () => path.join(tmp.dir, "update.lock");

  it("creates and removes the lock file", async () => {
    const release = await acquireLock(tmp.dir, now, makeLogger());
    expect(JSON.parse(await readFile(lockFile(), "utf8"))).toEqual({ pid: process.pid, startedAt: now.toISOString() });
    await release();
    await expect(readFile(lockFile())).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a recent lock", async () => {
    await writeFile(lockFile(), JSON.stringify({ startedAt: new Date(now.getTime() - 3600_000).toISOString() }));
    await expect(acquireLock(tmp.dir, now, makeLogger())).rejects.toThrow(/Another update is running .*started 2026-11-06T11:00:00.000Z/);
  });

  it.each([
    ["an old lock", JSON.stringify({ startedAt: new Date(now.getTime() - STALE_LOCK_MS).toISOString() })],
    ["an unreadable lock", "{garbage"],
  ])("replaces %s", async (_, content) => {
    await writeFile(lockFile(), content);
    const logger = makeLogger();
    const release = await acquireLock(tmp.dir, now, logger);
    expect(logger.find("Removing stale lock")).toHaveLength(1);
    await release();
  });

  it("passes on other errors", async () => {
    await expect(acquireLock(path.join(tmp.dir, "missing"), now, makeLogger())).rejects.toMatchObject({ code: "ENOENT" });
  });
});
