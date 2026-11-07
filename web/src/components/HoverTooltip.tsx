import { useLayoutEffect, useRef } from "react";
import type { Extract } from "../../../shared/schema.ts";
import { formatSize } from "../lib/format.ts";
import { PROVIDER_LABELS } from "../lib/providers.ts";

const MAX_ROWS = 6;
/** Gap between the cursor and the tooltip. */
const OFFSET = 14;
/** Smallest gap between the tooltip and the map's edges. */
const MARGIN = 8;

interface Props {
  x: number;
  y: number;
  /** Map container size, so the tooltip can stay inside it. */
  width: number;
  height: number;
  extracts: readonly Extract[];
}

/**
 * Start of the tooltip along one axis: after the cursor if it fits, else before
 * it. If neither fits, the side with more room, shifted to stay inside the map.
 */
function placeAxis(cursor: number, size: number, limit: number): number {
  const after = cursor + OFFSET;
  const before = cursor - OFFSET - size;
  let start = after;
  if (after + size > limit - MARGIN) {
    if (before >= MARGIN || cursor > limit - cursor) start = before;
  }
  return Math.max(MARGIN, Math.min(start, limit - MARGIN - size));
}

/** Top-left corner for a tooltip of size w × h near the cursor, inside a map of size width × height. */
export function placeTooltip(x: number, y: number, w: number, h: number, width: number, height: number) {
  return { left: placeAxis(x, w, width), top: placeAxis(y, h, height) };
}

/**
 * Follows the cursor. Hidden from screen readers: the extract list gives the
 * same details to keyboard and screen reader users.
 */
export function HoverTooltip({ x, y, width, height, extracts }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const more = extracts.length - MAX_ROWS;

  // Placed after measuring, before the browser paints.
  useLayoutEffect(() => {
    const el = ref.current!;
    const { left, top } = placeTooltip(x, y, el.offsetWidth, el.offsetHeight, width, height);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, width, height, extracts]);

  return (
    <div ref={ref} className="map-tooltip" aria-hidden="true">
      {extracts.slice(0, MAX_ROWS).map((e) => (
        <div key={e.key}>
          <strong>{e.name}</strong> · {PROVIDER_LABELS[e.provider]} · {formatSize(e.sizeBytes)}
        </div>
      ))}
      {more > 0 && <div className="muted">and {more} more</div>}
      {extracts.length > 1 && <div className="muted">Click to choose</div>}
    </div>
  );
}
