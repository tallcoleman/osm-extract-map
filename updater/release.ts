// Release directories on the data volume:
//
//   releases/<timestamp>/meta.json, extracts.json, boundaries-*.geojson
//   current -> releases/<timestamp>   (relative symlink, swapped atomically)
//
// The symlink is relative so the web container can mount the volume anywhere.

import { mkdir, readdir, readFile, readlink, rename, rm, symlink, writeFile as fsWriteFile } from "node:fs/promises";
import path from "node:path";
import {
  boundariesFile,
  type Extract,
  EXTRACTS_FILE,
  META_FILE,
  type Meta,
  PROVIDER_IDS,
  type ProviderId,
  SCHEMA_VERSION,
} from "../shared/schema.ts";
import type { Logger } from "./http.ts";

export const RELEASES_DIR = "releases";
export const CURRENT_LINK = "current";
export const KEEP_RELEASES = 3;

const RELEASE_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const FILE_NAME = /^[a-z0-9-]+\.(json|geojson)$/;

export interface PreviousRelease {
  meta: Meta;
  extracts: Extract[];
  /** Raw GeoJSON text per provider, copied unchanged into the next release. */
  boundaries: Partial<Record<ProviderId, string>>;
}

export interface PublishOptions {
  keep?: number;
  writeFile?: typeof fsWriteFile;
}

export const releaseName = (now: Date) => now.toISOString().replace(/[:.]/g, "-");

const isMissing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** Reads the release that `current` points to; null if there is none or it has an older schema. */
export async function readCurrentRelease(dataDir: string, logger: Logger): Promise<PreviousRelease | null> {
  const dir = path.join(dataDir, CURRENT_LINK);
  let metaText: string;
  try {
    metaText = await readFile(path.join(dir, META_FILE), "utf8");
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const meta = JSON.parse(metaText) as Meta;
  if (meta.schemaVersion !== SCHEMA_VERSION) {
    logger.warn(`Current release has schema version ${meta.schemaVersion}, not ${SCHEMA_VERSION}; not reusing it`);
    return null;
  }
  const extracts = JSON.parse(await readFile(path.join(dir, EXTRACTS_FILE), "utf8")) as Extract[];
  const boundaries: PreviousRelease["boundaries"] = {};
  for (const p of PROVIDER_IDS) {
    if (meta.providers[p]) boundaries[p] = await readFile(path.join(dir, boundariesFile(p)), "utf8");
  }
  return { meta, extracts, boundaries };
}

/**
 * Writes `files` into a new release directory, points `current` at it, and
 * prunes old releases. If anything fails before the swap, `current` is left
 * untouched and the partial directory is removed. Returns the release path.
 */
export async function publishRelease(
  dataDir: string,
  files: Record<string, string>,
  now: Date,
  options: PublishOptions = {},
): Promise<string> {
  const keep = options.keep ?? KEEP_RELEASES;
  const write = options.writeFile ?? fsWriteFile;
  for (const name of Object.keys(files)) {
    if (!FILE_NAME.test(name)) throw new Error(`Refusing to write release file "${name}"`);
  }

  const releasesDir = path.join(dataDir, RELEASES_DIR);
  await mkdir(releasesDir, { recursive: true });
  const name = releaseName(now);
  const finalDir = path.join(releasesDir, name);
  const partialDir = `${finalDir}.partial`;

  await mkdir(partialDir);
  try {
    for (const [file, content] of Object.entries(files)) await write(path.join(partialDir, file), content);
    await rename(partialDir, finalDir);
  } catch (error) {
    await rm(partialDir, { recursive: true, force: true });
    throw error;
  }

  // rename() over an existing symlink is atomic, so readers see the old or the new release, never neither.
  const tmpLink = path.join(dataDir, `${CURRENT_LINK}.tmp-${process.pid}`);
  await rm(tmpLink, { force: true });
  await symlink(path.join(RELEASES_DIR, name), tmpLink);
  await rename(tmpLink, path.join(dataDir, CURRENT_LINK));

  await pruneReleases(dataDir, keep);
  return finalDir;
}

/** Keeps the newest `keep` releases (always including the current one) and removes leftovers. */
export async function pruneReleases(dataDir: string, keep: number): Promise<string[]> {
  const releasesDir = path.join(dataDir, RELEASES_DIR);
  const current = path.basename(await readlink(path.join(dataDir, CURRENT_LINK)));
  const entries = await readdir(releasesDir);
  const releases = entries.filter((e) => RELEASE_NAME.test(e)).sort().reverse();
  const keepSet = new Set([current, ...releases.slice(0, keep)]);
  const removed = entries.filter((e) => !keepSet.has(e) && (RELEASE_NAME.test(e) || e.endsWith(".partial")));
  for (const e of removed) await rm(path.join(releasesDir, e), { recursive: true, force: true });
  return removed;
}
