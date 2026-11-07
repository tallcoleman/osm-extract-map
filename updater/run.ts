// runUpdate(): fetch the requested providers, validate, and publish a release.
//
// Providers that weren't requested are copied from the previous release
// unchanged. A requested provider that fails to fetch reuses its previous data,
// marked "stale". A validation failure publishes nothing. Coverage gaps are
// recomputed from the final boundaries; if that fails the release goes out
// without them.

import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  type BoundaryCollection,
  boundariesFile,
  type Extract,
  EXTRACTS_FILE,
  GAPS_FILE,
  META_FILE,
  type Meta,
  PROVIDER_IDS,
  PROVIDERS,
  type ProviderId,
  type ProviderMeta,
  SCHEMA_VERSION,
} from "../shared/schema.ts";
import { computeGaps, type MultiPolygon } from "./gaps.ts";
import type { Logger } from "./http.ts";
import { computeLevels, LevelError, type LevelOverrides, NO_OVERRIDES, overridesFor } from "./levels.ts";
import type { ProviderData } from "./providers/types.ts";
import { publishRelease, readCurrentRelease } from "./release.ts";
import { replicationStatus } from "./replication.ts";
import { validateMeta, validateProvider, ValidationError } from "./validate.ts";

export type Fetcher = () => Promise<ProviderData>;

export interface RunDeps {
  dataDir: string;
  providers: readonly ProviderId[];
  fetchers: Partial<Record<ProviderId, Fetcher>>;
  levelOverrides?: LevelOverrides;
  /** Land polygons for the coverage gaps; no gaps file is written without them. */
  land?: MultiPolygon;
  now?: () => Date;
  logger: Logger;
}

export interface RunResult {
  published: boolean;
  releaseDir: string | null;
  meta: Meta | null;
  /** Why nothing was published. */
  reason: string | null;
}

export const LOCK_FILE = "update.lock";
/** A lock older than this is assumed to be left over from a crashed run. */
export const STALE_LOCK_MS = 12 * 3600 * 1000;

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockError";
  }
}

/** Creates the lock file, or throws if another run holds it. Returns a release function. */
export async function acquireLock(dataDir: string, now: Date, logger: Logger): Promise<() => Promise<void>> {
  const file = path.join(dataDir, LOCK_FILE);
  const create = async () => {
    const handle = await open(file, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: now.toISOString() }));
    await handle.close();
  };
  try {
    await create();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let startedAt = Number.NaN;
    try {
      startedAt = Date.parse((JSON.parse(await readFile(file, "utf8")) as { startedAt: string }).startedAt);
    } catch {
      // Unreadable lock: treat it as stale.
    }
    if (now.getTime() - startedAt < STALE_LOCK_MS) {
      throw new LockError(`Another update is running (lock ${file}, started ${new Date(startedAt).toISOString()})`);
    }
    logger.warn(`Removing stale lock ${file}`);
    await rm(file, { force: true });
    await create();
  }
  return () => rm(file, { force: true });
}

/** Sets depth, leaf, bundle and replication status, and builds the boundary collection. */
export function finalizeProvider(
  provider: ProviderId,
  data: ProviderData,
  overrides: LevelOverrides,
  logger: Logger,
): { extracts: Extract[]; boundaries: BoundaryCollection } {
  const { levels, missingBundles } = computeLevels(data.extracts, overridesFor(overrides, provider));
  if (missingBundles.length > 0) {
    logger.warn(`${PROVIDERS[provider].name}: bundles in level-overrides.json not found: ${missingBundles.join(", ")}`);
  }
  const expected = PROVIDERS[provider].expectedInterval;
  const extracts = data.extracts
    .map((e): Extract => {
      const level = levels.get(e.key)!;
      return {
        ...e,
        depth: level.depth,
        isLeaf: level.isLeaf,
        isBundle: level.isBundle,
        replication: { ...e.replication, status: replicationStatus(e.replication.intervals, expected) },
      };
    })
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  const boundaries: BoundaryCollection = {
    type: "FeatureCollection",
    features: extracts.map((e) => ({
      type: "Feature",
      properties: { key: e.key, depth: e.depth, isLeaf: e.isLeaf, isBundle: e.isBundle, name: e.name },
      geometry: data.geometries.get(e.key)!,
    })),
  };
  return { extracts, boundaries };
}

export async function runUpdate(deps: RunDeps): Promise<RunResult> {
  const { dataDir, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const overrides = deps.levelOverrides ?? NO_OVERRIDES;
  for (const p of deps.providers) {
    if (!deps.fetchers[p]) throw new Error(`No fetcher for provider "${p}"`);
  }

  await mkdir(dataDir, { recursive: true });
  const release = await acquireLock(dataDir, now(), logger);
  try {
    const previous = await readCurrentRelease(dataDir, logger);
    const providers: Partial<Record<ProviderId, ProviderMeta>> = {};
    const extracts: Extract[] = [];
    const boundaries: Partial<Record<ProviderId, string>> = {};
    let fetched = 0;

    for (const p of PROVIDER_IDS) {
      const name = PROVIDERS[p].name;
      const prevMeta = previous?.meta.providers[p];
      // Copies this provider from the previous release, if it has it.
      const carryOver = (stale: boolean) => {
        if (!previous || !prevMeta) return false;
        providers[p] = stale ? { ...prevMeta, status: "stale" } : prevMeta;
        extracts.push(...previous.extracts.filter((e) => e.provider === p));
        boundaries[p] = previous.boundaries[p]!;
        return true;
      };

      if (!deps.providers.includes(p)) {
        if (carryOver(false)) logger.info(`${name}: not requested, carried over from the previous release`);
        continue;
      }

      let data: ProviderData;
      try {
        data = await deps.fetchers[p]!();
      } catch (error) {
        logger.warn(`${name}: fetch failed: ${(error as Error).message}`);
        if (carryOver(true)) logger.warn(`${name}: reusing the previous release's data, marked stale`);
        else logger.warn(`${name}: no previous data, left out of this release`);
        continue;
      }

      let result: ReturnType<typeof finalizeProvider>;
      try {
        const valid = validateProvider(p, data, prevMeta?.extractCount ?? null, logger);
        result = finalizeProvider(p, valid, overrides, logger);
      } catch (error) {
        if (!(error instanceof ValidationError || error instanceof LevelError)) throw error;
        logger.warn(`Validation failed, keeping the current release: ${error.message}`);
        return { published: false, releaseDir: null, meta: null, reason: error.message };
      }
      providers[p] = { extractCount: result.extracts.length, fetchedAt: data.fetchedAt, status: "ok" };
      extracts.push(...result.extracts);
      boundaries[p] = JSON.stringify(result.boundaries);
      fetched++;
    }

    if (fetched === 0) {
      const reason = "no requested provider could be fetched";
      logger.warn(`Keeping the current release: ${reason}`);
      return { published: false, releaseDir: null, meta: null, reason };
    }

    let gapsText: string | null = null;
    if (deps.land) {
      const started = Date.now();
      try {
        const parsed = Object.fromEntries(Object.entries(boundaries).map(([p, text]) => [p, JSON.parse(text) as BoundaryCollection]));
        gapsText = JSON.stringify(computeGaps(parsed, deps.land));
        logger.info(`Coverage gaps computed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      } catch (error) {
        logger.warn(`Coverage gaps not computed, publishing without them: ${(error as Error).message}`);
      }
    }

    const meta: Meta = {
      generatedAt: now().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      providers,
      files: {
        extracts: EXTRACTS_FILE,
        boundaries: Object.fromEntries(Object.keys(boundaries).map((p) => [p, boundariesFile(p as ProviderId)])),
        ...(gapsText !== null && { gaps: GAPS_FILE }),
      },
    };
    validateMeta(meta);

    const files: Record<string, string> = {
      [META_FILE]: JSON.stringify(meta, null, 2),
      // Already sorted by key: providers in PROVIDER_IDS order, each sorted.
      [EXTRACTS_FILE]: JSON.stringify(extracts),
    };
    for (const [p, text] of Object.entries(boundaries)) files[boundariesFile(p as ProviderId)] = text;
    if (gapsText !== null) files[GAPS_FILE] = gapsText;

    const releaseDir = await publishRelease(dataDir, files, now());
    logger.info(`Published ${releaseDir} (${extracts.length} extracts)`);
    return { published: true, releaseDir, meta, reason: null };
  } finally {
    await release();
  }
}
