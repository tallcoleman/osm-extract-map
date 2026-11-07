import type { ExpressionSpecification } from "maplibre-gl";
import type { Level } from "../../../shared/levels.ts";

export { type Level, type LevelClass, levelClass, type LevelFields } from "../../../shared/levels.ts";

export const LEVELS: readonly { value: Level; label: string }[] = [
  { value: "smallest", label: "Smallest available" },
  { value: 0, label: "Continent" },
  { value: 1, label: "Country" },
  { value: 2, label: "Region" },
  { value: 3, label: "Sub-region" },
];

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
