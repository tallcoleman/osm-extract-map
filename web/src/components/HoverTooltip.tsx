import type { Extract } from "../../../shared/schema.ts";
import { formatSize } from "../lib/format.ts";
import { PROVIDER_LABELS } from "../lib/providers.ts";

const MAX_ROWS = 6;

/**
 * Follows the cursor. Hidden from screen readers: the extract list gives the
 * same details to keyboard and screen reader users.
 */
interface Props {
  x: number;
  y: number;
  /** Map container size, so the tooltip can flip to stay inside it. */
  width: number;
  height: number;
  extracts: readonly Extract[];
}

const OFFSET = 14;

export function HoverTooltip({ x, y, width, height, extracts }: Props) {
  const more = extracts.length - MAX_ROWS;
  const flipX = x > width - 320;
  const flipY = y > height - 160;
  const transform = `translate(${flipX ? `calc(-100% - ${OFFSET}px)` : `${OFFSET}px`}, ${flipY ? `calc(-100% - ${OFFSET}px)` : `${OFFSET}px`})`;
  return (
    <div className="map-tooltip" style={{ left: x, top: y, transform }} aria-hidden="true">
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
