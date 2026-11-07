import type { ProviderId } from "../../../shared/schema.ts";
import { PROVIDER_COLORS, PROVIDER_LABELS } from "../lib/providers.ts";

/** Provider colour swatch plus its name, so colour is never the only cue. */
export function ProviderTag({ provider }: { provider: ProviderId }) {
  return (
    <span className="provider-tag">
      <span className="swatch" style={{ background: PROVIDER_COLORS[provider] }} aria-hidden="true" />
      {PROVIDER_LABELS[provider]}
    </span>
  );
}
