import type { Extract } from "../../../shared/schema.ts";

/** Separator between region names in a parent path. */
export const PATH_SEPARATOR = " › ";

/** Names of an extract's parents, outermost first. */
export function parentNames(extract: Extract, byKey: ReadonlyMap<string, Extract>): string[] {
  const names: string[] = [];
  const seen = new Set([extract.key]);
  let key = extract.parentKey;
  // `seen` guards against a cycle in bad data.
  while (key && !seen.has(key)) {
    seen.add(key);
    const parent = byKey.get(key);
    if (!parent) break;
    names.unshift(parent.name);
    key = parent.parentKey;
  }
  return names;
}

/** Parent path of every extract, e.g. "Europe › Germany"; empty for top-level extracts. */
export function parentPaths(extracts: readonly Extract[]): Map<string, string> {
  const byKey = new Map(extracts.map((e) => [e.key, e]));
  return new Map(extracts.map((e) => [e.key, parentNames(e, byKey).join(PATH_SEPARATOR)]));
}
