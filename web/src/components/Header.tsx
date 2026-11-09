import { type Meta, PROVIDER_IDS, PROVIDERS, type ProviderId } from "../../../shared/schema.ts";
import { formatDate } from "../lib/format.ts";
import { ExternalLink } from "./ExternalLink.tsx";

export const REPO_URL = "https://github.com/tallcoleman/osm-extract-map";

interface Props {
  /** Absent while the data is loading; the update dates are left out then. */
  meta?: Meta;
  /** Providers whose boundaries failed to load in this browser. */
  failed?: readonly ProviderId[];
}

function Warning({ children }: { children: string }) {
  return (
    <span className="badge badge-warning">
      <span aria-hidden="true">⚠ </span>
      {children}
    </span>
  );
}

export function Header({ meta, failed = [] }: Props) {
  return (
    <header className="header">
      <h1>OSM Extracts Map</h1>
      <p className="intro">
        Compare OpenStreetMap extracts and estimate the download size for the areas you need.{" "}
        <ExternalLink href={REPO_URL}>Source on GitHub</ExternalLink>
      </p>
      <div className="providers">
        <span id="providers-label" className="providers-label">
          Providers:
        </span>
        <ul aria-labelledby="providers-label">
          {PROVIDER_IDS.map((p) => {
            const info = meta?.providers[p];
            return (
              <li key={p}>
                <ExternalLink href={PROVIDERS[p].homepage}>{PROVIDERS[p].name}</ExternalLink>
                {meta && " "}
                {meta && <span className="muted updated">{info ? `(last checked ${formatDate(info.fetchedAt)})` : "(no data yet)"}</span>}
                {info?.status === "stale" && <Warning>Last update failed; may be out of date</Warning>}
                {failed.includes(p) && <Warning>Boundaries failed to load</Warning>}
              </li>
            );
          })}
        </ul>
      </div>
    </header>
  );
}
