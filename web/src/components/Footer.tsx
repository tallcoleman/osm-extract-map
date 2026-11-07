import { type Meta, PROVIDER_IDS, type ProviderId } from "../../../shared/schema.ts";
import { formatDate } from "../lib/format.ts";
import { PROVIDER_LABELS } from "../lib/providers.ts";

export const REPO_URL = "https://github.com/tallcoleman/osm-extract-map";

interface Props {
  meta: Meta;
  /** Providers whose boundaries failed to load in this browser. */
  failed: readonly ProviderId[];
}

export function Footer({ meta, failed }: Props) {
  return (
    <footer className="footer">
      <ul className="updated">
        {PROVIDER_IDS.map((p) => {
          const info = meta.providers[p];
          return (
            <li key={p}>
              {info ? (
                <>
                  {PROVIDER_LABELS[p]} data from {formatDate(info.fetchedAt)}
                  {info.status === "stale" && (
                    <span className="badge badge-warning">
                      <span aria-hidden="true">⚠ </span>Last update failed; may be out of date
                    </span>
                  )}
                </>
              ) : (
                <>{PROVIDER_LABELS[p]} data isn't available yet.</>
              )}
              {failed.includes(p) && (
                <span className="badge badge-warning">
                  <span aria-hidden="true">⚠ </span>Boundaries failed to load
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">
        Geofabrik data is refreshed weekly, OSM-FR data occasionally. ·{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          Source on GitHub
        </a>
      </p>
    </footer>
  );
}
