import type { ProviderId } from "../../../shared/schema.ts";
import { choiceLabel, PROVIDER_CHOICES, PROVIDER_COLORS, type ProviderChoice } from "../lib/providers.ts";

interface Props {
  value: ProviderChoice;
  available: readonly ProviderId[];
  onChange: (value: ProviderChoice) => void;
}

export function ProviderToggle({ value, available, onChange }: Props) {
  return (
    <fieldset className="segmented">
      <legend>
        <h2>Providers</h2>
      </legend>
      {PROVIDER_CHOICES.map((c) => {
        const disabled = c !== "both" && !available.includes(c);
        return (
          <label key={c} className={disabled ? "disabled" : undefined}>
            <input type="radio" name="provider" value={c} checked={value === c} disabled={disabled} onChange={() => onChange(c)} />
            <span>
              {c !== "both" && <span className="swatch" style={{ background: PROVIDER_COLORS[c] }} aria-hidden="true" />}
              {choiceLabel(c)}
              {disabled && (
                <>
                  {" "}
                  <span className="sr-only">(not available yet)</span>
                </>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
