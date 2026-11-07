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
        <legend>Level</legend>
        {LEVELS.map((l) => (
          <label key={String(l.value)}>
            <input type="radio" name="level" value={String(l.value)} checked={value === l.value} onChange={() => onChange(l.value)} />
            {l.label}
          </label>
        ))}
      </fieldset>
      <div className="legend">
        <p id="legend-title" className="legend-title">
          Legend
        </p>
        <ul aria-labelledby="legend-title">
          <li>
            <span className="legend-line" aria-hidden="true" />
            {value === "smallest" ? "The smallest extract each provider offers for an area" : "Extract at this level"}
          </li>
          {value !== "smallest" && (
            <li>
              <span className="legend-line legend-coarser" aria-hidden="true" />
              Coarser: nothing at this level here, so the provider's smallest larger extract is shown
            </li>
          )}
          {showGaps && (
            <li>
              <span className="legend-hatch" aria-hidden="true" />
              No extract shown at this level
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
