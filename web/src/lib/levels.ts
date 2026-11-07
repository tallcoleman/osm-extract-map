import type { ExpressionSpecification } from "maplibre-gl";

/** "smallest" shows every leaf; a number shows that depth plus the coarser fallback. */
export type Level = "smallest" | 0 | 1 | 2 | 3;

export const LEVELS: readonly { value: Level; label: string }[] = [
  { value: "smallest", label: "Smallest available" },
  { value: 0, label: "Continent" },
  { value: 1, label: "Country" },
  { value: 2, label: "Region" },
  { value: 3, label: "Sub-region" },
];

export interface LevelFields {
  depth: number;
  isLeaf: boolean;
  isBundle: boolean;
}

/** How an extract is drawn at a level: normal, coarser (fallback), or not at all. */
export type LevelClass = "normal" | "coarser" | null;

/**
 * Same rule as levelFilters(), for extracts in JS (the list and totals).
 * Bundles are always left out.
 */
export function levelClass(e: LevelFields, level: Level): LevelClass {
  if (e.isBundle) return null;
  if (level === "smallest") return e.isLeaf ? "normal" : null;
  if (e.depth === level) return "normal";
  if (e.depth < level && e.isLeaf) return "coarser";
  return null;
}

const notBundle: ExpressionSpecification = ["!", ["get", "isBundle"]];

/**
 * MapLibre filters for the normal and coarser layers. Level d shows depth d,
 * plus leaves above d in the coarser style, for branches with nothing at d.
 */
export function levelFilters(level: Level): { normal: ExpressionSpecification; coarser: ExpressionSpecification; any: ExpressionSpecification } {
  if (level === "smallest") {
    const normal: ExpressionSpecification = ["all", ["get", "isLeaf"], notBundle];
    return { normal, coarser: ["boolean", false], any: normal };
  }
  const normal: ExpressionSpecification = ["all", ["==", ["get", "depth"], level], notBundle];
  const coarser: ExpressionSpecification = ["all", ["<", ["get", "depth"], level], ["get", "isLeaf"], notBundle];
  return { normal, coarser, any: ["any", normal, coarser] };
}
