import { PROVIDERS } from "../../../shared/schema.ts";

export function Header() {
  return (
    <header className="header">
      <h1>OSM Extracts Map</h1>
      <p>
        Compare the OpenStreetMap extracts offered by Geofabrik and OpenStreetMap France, and estimate the download size for the
        areas you need. Downloads stay on the providers' sites.
      </p>
      <p className="provider-links">
        <a href={PROVIDERS.geofabrik.homepage} target="_blank" rel="noopener noreferrer">
          Geofabrik{" "}
          <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
        <a href={PROVIDERS.osmfr.homepage} target="_blank" rel="noopener noreferrer">
          OpenStreetMap France{" "}
          <span aria-hidden="true">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </p>
    </header>
  );
}
