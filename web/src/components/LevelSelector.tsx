import { type Level, LEVELS } from "../lib/levels.ts";

interface Props {
  value: Level;
  onChange: (value: Level) => void;
}

export function LevelSelector({ value, onChange }: Props) {
  return (
    <fieldset className="levels">
      <legend>Level</legend>
      {LEVELS.map((l) => (
        <label key={String(l.value)}>
          <input type="radio" name="level" value={String(l.value)} checked={value === l.value} onChange={() => onChange(l.value)} />
          {l.label}
        </label>
      ))}
      <ul className="legend" aria-label="Line styles">
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
      </ul>
    </fieldset>
  );
}
