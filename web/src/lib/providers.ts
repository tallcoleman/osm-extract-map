import { PROVIDER_IDS, type ProviderId } from "../../../shared/schema.ts";

/** Short labels for the UI. PROVIDERS[p].name is the full name. */
export const PROVIDER_LABELS: Record<ProviderId, string> = { geofabrik: "Geofabrik", osmfr: "OSM-FR" };

/**
 * Line colours: Okabe-Ito blue and a darkened vermillion, which stay apart for
 * the common kinds of colour blindness. OSM-FR lines are also offset slightly,
 * so overlapping outlines don't hide each other.
 */
export const PROVIDER_COLORS: Record<ProviderId, string> = { geofabrik: "#0072b2", osmfr: "#b84a00" };

/** Added to each provider's GeoJSON source. The basemap already credits MapTiler and OSM contributors. */
export const PROVIDER_ATTRIBUTION: Record<ProviderId, string> = {
  geofabrik: '<a href="https://www.geofabrik.de/" target="_blank" rel="noopener">Geofabrik</a> extracts',
  osmfr: '<a href="https://www.openstreetmap.fr/" target="_blank" rel="noopener">OpenStreetMap France</a> extracts',
};

export type ProviderChoice = ProviderId | "both";

export const PROVIDER_CHOICES: readonly ProviderChoice[] = ["both", "geofabrik", "osmfr"];

export function choiceLabel(choice: ProviderChoice): string {
  return choice === "both" ? "Both" : PROVIDER_LABELS[choice];
}

/** Providers to show for a choice, limited to those that have data. */
export function visibleProviders(choice: ProviderChoice, available: readonly ProviderId[]): ProviderId[] {
  return PROVIDER_IDS.filter((p) => available.includes(p) && (choice === "both" || choice === p));
}

/** The provider part of an extract key ("osmfr:europe/france" → "osmfr"). */
export function providerOfKey(key: string): ProviderId | null {
  const p = key.slice(0, key.indexOf(":"));
  return (PROVIDER_IDS as readonly string[]).includes(p) ? (p as ProviderId) : null;
}
