import { mkdir, readdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeLogger, makeTempDir } from "../test/helpers.ts";
import { SCHEMA_VERSION } from "../shared/schema.ts";
import { publishRelease, pruneReleases, readCurrentRelease, releaseName } from "./release.ts";

let tmp: Awaited<ReturnType<typeof makeTempDir>>;
beforeEach(async () => {
  tmp = await makeTempDir("release-test-");
});
afterEach(() => tmp.cleanup());

const at = (minute: number) => new Date(Date.UTC(2026, 10, 6, 12, minute, 0, 5));
const files = (tag: string) => ({ "meta.json": `{"tag":"${tag}"}`, "extracts.json": "[]" });
const current = () => readlink(path.join(tmp.dir, "current"));
const releases = () => readdir(path.join(tmp.dir, "releases"));

describe("releaseName", () => {
  it("is a sortable, filesystem-safe timestamp", () => {
    expect(releaseName(at(7))).toBe("2026-11-06T12-07-00-005Z");
  });
});

describe("publishRelease", () => {
  it("writes the files and points current at the new release with a relative link", async () => {
    const dir = await publishRelease(tmp.dir, files("one"), at(0));
    expect(dir).toBe(path.join(tmp.dir, "releases", "2026-11-06T12-00-00-005Z"));
    expect(await current()).toBe(path.join("releases", "2026-11-06T12-00-00-005Z"));
    expect(await readFile(path.join(tmp.dir, "current", "meta.json"), "utf8")).toBe('{"tag":"one"}');
    expect(await readdir(tmp.dir)).toEqual(["current", "releases"]);
  });

  it("swaps current to each newer release", async () => {
    await publishRelease(tmp.dir, files("one"), at(0));
    await publishRelease(tmp.dir, files("two"), at(1));
    expect(await readFile(path.join(tmp.dir, "current", "meta.json"), "utf8")).toBe('{"tag":"two"}');
  });

  it("keeps the last 3 releases", async () => {
    for (let i = 0; i < 5; i++) await publishRelease(tmp.dir, files(`r${i}`), at(i));
    expect(await releases()).toEqual([releaseName(at(2)), releaseName(at(3)), releaseName(at(4))]);
  });

  it("leaves current untouched and cleans up when a write fails", async () => {
    await publishRelease(tmp.dir, files("one"), at(0));
    let calls = 0;
    const failing = (async (file: string, data: string) => {
      if (++calls === 2) throw new Error("disk full");
      await writeFile(file, data);
    }) as typeof writeFile;
    await expect(publishRelease(tmp.dir, files("two"), at(1), { writeFile: failing })).rejects.toThrow("disk full");
    expect(await current()).toBe(path.join("releases", releaseName(at(0))));
    expect(await releases()).toEqual([releaseName(at(0))]);
  });

  it("refuses file names that could escape the release directory", async () => {
    for (const name of ["../x.json", "a/b.json", "x.html", ".json"]) {
      await expect(publishRelease(tmp.dir, { [name]: "{}" }, at(0))).rejects.toThrow(/Refusing to write/);
    }
  });

  it("replaces a leftover temporary link", async () => {
    await writeFile(path.join(tmp.dir, `current.tmp-${process.pid}`), "");
    await publishRelease(tmp.dir, files("one"), at(0));
    expect(await readdir(tmp.dir)).toEqual(["current", "releases"]);
  });
});

describe("pruneReleases", () => {
  it("never removes the current release, and removes leftover partial directories", async () => {
    await publishRelease(tmp.dir, files("old"), at(0));
    // Newer releases exist (e.g. from a clock change), but current points at the old one.
    for (const m of [5, 6, 7]) await mkdir(path.join(tmp.dir, "releases", releaseName(at(m))));
    await mkdir(path.join(tmp.dir, "releases", `${releaseName(at(8))}.partial`));
    await writeFile(path.join(tmp.dir, "releases", "notes.txt"), "keep me");

    const removed = await pruneReleases(tmp.dir, 2);
    expect(removed.sort()).toEqual([releaseName(at(5)), `${releaseName(at(8))}.partial`]);
    expect((await releases()).sort()).toEqual([releaseName(at(0)), releaseName(at(6)), releaseName(at(7)), "notes.txt"]);
  });
});

describe("readCurrentRelease", () => {
  const meta = (providers: object, schemaVersion = SCHEMA_VERSION) =>
    JSON.stringify({ generatedAt: "x", schemaVersion, providers, files: {} });

  it("returns null when there is no release yet", async () => {
    expect(await readCurrentRelease(tmp.dir, makeLogger())).toBeNull();
  });

  it("reads meta, extracts and each listed provider's boundaries", async () => {
    await publishRelease(
      tmp.dir,
      {
        "meta.json": meta({ osmfr: { extractCount: 1, fetchedAt: "t", status: "ok" } }),
        "extracts.json": '[{"key":"osmfr:a"}]',
        "boundaries-osmfr.geojson": '{"type":"FeatureCollection","features":[]}',
      },
      at(0),
    );
    const prev = await readCurrentRelease(tmp.dir, makeLogger());
    expect(prev!.meta.providers.osmfr!.extractCount).toBe(1);
    expect(prev!.extracts).toEqual([{ key: "osmfr:a" }]);
    expect(prev!.boundaries).toEqual({ osmfr: '{"type":"FeatureCollection","features":[]}' });
  });

  it("ignores a release with another schema version", async () => {
    await publishRelease(tmp.dir, { "meta.json": meta({}, SCHEMA_VERSION - 1), "extracts.json": "[]" }, at(0));
    const logger = makeLogger();
    expect(await readCurrentRelease(tmp.dir, logger)).toBeNull();
    expect(logger.find("not reusing it")).toHaveLength(1);
  });

  it("fails on other read errors", async () => {
    await mkdir(path.join(tmp.dir, "current", "meta.json"), { recursive: true });
    await expect(readCurrentRelease(tmp.dir, makeLogger())).rejects.toMatchObject({ code: "EISDIR" });
  });
});
