// Depth and leaf computation, with manual depth overrides.
//
// depth = number of ancestors, unless overridden. An override sets that
// extract's depth, and its descendants follow from it (child = parent + 1).

export interface LevelInput {
  key: string;
  parentKey: string | null;
}

export interface Level {
  depth: number;
  isLeaf: boolean;
}

export type LevelOverrides = Record<string, number>;

export class LevelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LevelError";
  }
}

/** Checks the shape of a parsed level-overrides.json. */
export function parseLevelOverrides(value: unknown): LevelOverrides {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new LevelError("level overrides must be an object of key → depth");
  }
  const out: LevelOverrides = {};
  for (const [key, depth] of Object.entries(value)) {
    if (!/^[a-z]+:./.test(key)) throw new LevelError(`level override key "${key}" is not "<provider>:<id>"`);
    if (!Number.isInteger(depth) || (depth as number) < 0) {
      throw new LevelError(`level override for "${key}" must be a non-negative integer`);
    }
    out[key] = depth as number;
  }
  return out;
}

/** Overrides whose key belongs to one provider. */
export function overridesFor(overrides: LevelOverrides, provider: string): LevelOverrides {
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => key.startsWith(`${provider}:`)));
}

export function computeLevels(items: readonly LevelInput[], overrides: LevelOverrides = {}): Map<string, Level> {
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const key of Object.keys(overrides)) {
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
    const depth = overrides[key] ?? (parentKey === null ? 0 : depthOf(parentKey, seen) + 1);
    depths.set(key, depth);
    return depth;
  };

  return new Map(items.map((i) => [i.key, { depth: depthOf(i.key, new Set()), isLeaf: !hasChildren.has(i.key) }]));
}
