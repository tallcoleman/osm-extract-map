import type { Extract } from "../../../shared/schema.ts";

/** Anything with a `key` property, like a MapLibre feature from a click. */
export interface KeyedFeature {
  properties?: { key?: unknown } | null;
}

/**
 * Extracts under a click, without duplicates (a feature can come back once per
 * tile), smallest first: deepest, then by size.
 */
export function pickerCandidates(features: readonly KeyedFeature[], byKey: ReadonlyMap<string, Extract>): Extract[] {
  const seen = new Set<string>();
  const out: Extract[] = [];
  for (const f of features) {
    const key = f.properties?.key;
    if (typeof key !== "string" || seen.has(key)) continue;
    seen.add(key);
    const e = byKey.get(key);
    if (e) out.push(e);
  }
  return out.sort(
    (a, b) =>
      b.depth - a.depth ||
      (a.sizeBytes ?? Infinity) - (b.sizeBytes ?? Infinity) ||
      a.provider.localeCompare(b.provider) ||
      a.name.localeCompare(b.name),
  );
}
