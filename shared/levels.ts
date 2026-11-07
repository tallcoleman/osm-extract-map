// Which extracts are drawn at each level. Shared by the web app (map and list)
// and the updater (coverage gaps), so both agree on what a level shows.

/** "smallest" shows every leaf; a number shows that depth plus the coarser fallback. */
export type Level = "smallest" | 0 | 1 | 2 | 3;

export const LEVEL_VALUES: readonly Level[] = ["smallest", 0, 1, 2, 3];

export interface LevelFields {
  depth: number;
  isLeaf: boolean;
  isBundle: boolean;
}

/** How an extract is drawn at a level: normal, coarser (fallback), or not at all. */
export type LevelClass = "normal" | "coarser" | null;

/**
 * Level d shows depth d, plus leaves above d in the coarser style, for branches
 * with nothing at d. Bundles are always left out. web/src/lib/levels.ts has the
 * same rule as MapLibre filters.
 */
export function levelClass(e: LevelFields, level: Level): LevelClass {
  if (e.isBundle) return null;
  if (level === "smallest") return e.isLeaf ? "normal" : null;
  if (e.depth === level) return "normal";
  if (e.depth < level && e.isLeaf) return "coarser";
  return null;
}
