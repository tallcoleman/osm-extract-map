import { type Level, LEVELS } from "../lib/levels.ts";

interface Props {
  value: Level;
  onChange: (value: Level) => void;
  /** Whether the map hatches land with no extract (once the gaps have loaded). */
  showGaps?: boolean;
}

export function LevelSelector({ value, onChange, showGaps = false }: Props) {
  return (
    <>
      <fieldset className="levels">
        <legend>
          <h2>Level</h2>
        </legend>
        {LEVELS.map((l) => (
          <label key={String(l.value)}>
            <input type="radio" name="level" value={String(l.value)} checked={value === l.value} onChange={() => onChange(l.value)} />
            {l.label}
          </label>
        ))}
      </fieldset>
      <div className="legend">
        <h2 id="legend-title" className="legend-title">
          Legend
        </h2>
        <ul aria-labelledby="legend-title">
          <li>
            <span className="legend-line" aria-hidden="true" />
            <span className="sr-only">Solid line: </span>
            {value === "smallest" ? "The smallest extract each provider offers for an area" : "Extract at this level"}
          </li>
          {value !== "smallest" && (
            <li>
              <span className="legend-line legend-coarser" aria-hidden="true" />
              <span className="sr-only">Faded dashed line: </span>
              Coarser: nothing at this level here, so the provider's smallest larger extract is shown
            </li>
          )}
          {showGaps && (
            <li>
              <span className="legend-hatch" aria-hidden="true" />
              <span className="sr-only">Hatched area: </span>
              No extract shown at this level
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
