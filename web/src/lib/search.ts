import type { Extract, ProviderId } from "../../../shared/schema.ts";
import { type Level, levelClass } from "./levels.ts";

export interface ListItem {
  extract: Extract;
  coarser: boolean;
}

export type SortOrder = "name" | "size";

/** Lower case, accents and punctuation removed, so "Québec" matches "quebec" and "cote d'or" matches "Cote d'Or". */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Extracts drawn on the map at this level for these providers, filtered by name. */
export function visibleExtracts(
  extracts: readonly Extract[],
  options: { providers: readonly ProviderId[]; level: Level; query: string },
): ListItem[] {
  const words = normalizeText(options.query).split(" ").filter(Boolean);
  const items: ListItem[] = [];
  for (const e of extracts) {
    if (!options.providers.includes(e.provider)) continue;
    const cls = levelClass(e, options.level);
    if (!cls) continue;
    if (words.length) {
      const name = normalizeText(e.name);
      if (!words.every((w) => name.includes(w))) continue;
    }
    items.push({ extract: e, coarser: cls === "coarser" });
  }
  return items;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const byName = (a: ListItem, b: ListItem) =>
  collator.compare(a.extract.name, b.extract.name) || a.extract.provider.localeCompare(b.extract.provider);

/** By name, or by size from smallest (unknown sizes last). Returns a new array. */
export function sortItems(items: readonly ListItem[], order: SortOrder): ListItem[] {
  if (order === "name") return [...items].sort(byName);
  return [...items].sort((a, b) => {
    const x = a.extract.sizeBytes;
    const y = b.extract.sizeBytes;
    if (x === y) return byName(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  });
}
