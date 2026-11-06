// Depth and leaf computation, with manual depth overrides and bundle flags.
//
// depth = number of ancestors, unless overridden. An override sets that
// extract's depth, and its descendants follow from it (child = parent + 1).
//
// A bundle is an extract that repeats others the provider also offers on their
// own, listed beside them rather than as their parent (Geofabrik's "dach" next
// to Germany, Austria and Switzerland). Level views leave bundles out.

export interface LevelInput {
  key: string;
  parentKey: string | null;
}

export interface Level {
  depth: number;
  isLeaf: boolean;
  isBundle: boolean;
}

export interface LevelOverrides {
  /** key → depth. */
  depth: Record<string, number>;
  /** Keys of bundle extracts. */
  bundles: string[];
}

export const NO_OVERRIDES: LevelOverrides = { depth: {}, bundles: [] };

export class LevelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LevelError";
  }
}

const KEY = /^[a-z]+:./;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks the shape of a parsed level-overrides.json. */
export function parseLevelOverrides(value: unknown): LevelOverrides {
  if (!isObject(value)) throw new LevelError('level overrides must be an object with "depth" and "bundles"');
  for (const field of Object.keys(value)) {
    if (field !== "depth" && field !== "bundles") throw new LevelError(`level overrides: unknown field "${field}"`);
  }
  const depthIn = value.depth ?? {};
  if (!isObject(depthIn)) throw new LevelError('level overrides: "depth" must be an object of key → depth');
  const depth: Record<string, number> = {};
  for (const [key, d] of Object.entries(depthIn)) {
    if (!KEY.test(key)) throw new LevelError(`level override key "${key}" is not "<provider>:<id>"`);
    if (!Number.isInteger(d) || (d as number) < 0) {
      throw new LevelError(`level override for "${key}" must be a non-negative integer`);
    }
    depth[key] = d as number;
  }
  const bundles = value.bundles ?? [];
  if (!Array.isArray(bundles)) throw new LevelError('level overrides: "bundles" must be an array of keys');
  for (const key of bundles) {
    if (typeof key !== "string" || !KEY.test(key)) throw new LevelError(`bundle "${String(key)}" is not "<provider>:<id>"`);
  }
  return { depth, bundles: bundles as string[] };
}

/** Overrides whose key belongs to one provider. */
export function overridesFor(overrides: LevelOverrides, provider: string): LevelOverrides {
  const own = (key: string) => key.startsWith(`${provider}:`);
  return {
    depth: Object.fromEntries(Object.entries(overrides.depth).filter(([key]) => own(key))),
    bundles: overrides.bundles.filter(own),
  };
}

/**
 * Depth, leaf and bundle flag per key. A depth override for a missing key is an
 * error; a bundle that's missing is returned in `missingBundles` (providers
 * drop bundles now and then, and that shouldn't block an update).
 */
export function computeLevels(
  items: readonly LevelInput[],
  overrides: LevelOverrides = NO_OVERRIDES,
): { levels: Map<string, Level>; missingBundles: string[] } {
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const key of Object.keys(overrides.depth)) {
    if (!byKey.has(key)) throw new LevelError(`level override for missing extract "${key}"`);
  }
  const hasChildren = new Set<string>();
  for (const item of items) {
    if (item.parentKey === null) continue;
    if (!byKey.has(item.parentKey)) throw new LevelError(`parent "${item.parentKey}" of "${item.key}" not found`);
    hasChildren.add(item.parentKey);
  }

  const depths = new Map<string, number>();
  const depthOf = (key: string, seen: Set<string>): number => {
    const known = depths.get(key);
    if (known !== undefined) return known;
    if (seen.has(key)) throw new LevelError(`parent cycle through "${key}"`);
    seen.add(key);
    const parentKey = byKey.get(key)!.parentKey;
    const depth = overrides.depth[key] ?? (parentKey === null ? 0 : depthOf(parentKey, seen) + 1);
    depths.set(key, depth);
    return depth;
  };

  const bundles = new Set(overrides.bundles);
  const levels = new Map(
    items.map((i) => [i.key, { depth: depthOf(i.key, new Set()), isLeaf: !hasChildren.has(i.key), isBundle: bundles.has(i.key) }]),
  );
  return { levels, missingBundles: overrides.bundles.filter((key) => !byKey.has(key)) };
}
