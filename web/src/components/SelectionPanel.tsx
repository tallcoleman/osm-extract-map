import type { Extract, ProviderId } from "../../../shared/schema.ts";
import { replicationDetail } from "../lib/badges.ts";
import { formatBytes, formatCount, formatSize } from "../lib/format.ts";
import { PROVIDER_LABELS } from "../lib/providers.ts";
import { safeHref } from "../lib/safe-href.ts";
import { selectionTotals, type SizeTotal } from "../lib/selection.ts";
import { CopyButton } from "./CopyButton.tsx";
import { ProviderTag } from "./ProviderTag.tsx";
import { ReplicationBadge } from "./ReplicationBadge.tsx";

interface Props {
  extracts: readonly Extract[];
  /** Parent path of each extract by key, e.g. "Europe › Germany". */
  parents: ReadonlyMap<string, string>;
  onRemove: (key: string) => void;
  onClear: () => void;
  onZoom: (key: string) => void;
}

function sizeText(t: SizeTotal): string {
  if (t.unknown === t.count) return "size unknown";
  const unknown = t.unknown ? ` (+ ${t.unknown} of unknown size)` : "";
  return `about ${formatBytes(t.bytes)}${unknown}`;
}

const COPY_URLS = [
  ["pbf", ".pbf", ".pbf URL"],
  ["poly", ".poly", ".poly URL"],
  ["replication", "Updates", "replication URL"],
] as const;

export function SelectionPanel({ extracts, parents, onRemove, onClear, onZoom }: Props) {
  const totals = selectionTotals(extracts);
  const summary = extracts.length ? `${formatCount(totals.count, "extract", "extracts")} selected, ${sizeText(totals)}` : "";

  return (
    <section className="panel selection" aria-labelledby="selection-title">
      <div className="panel-head">
        <h2 id="selection-title">Selection</h2>
        {extracts.length > 0 && (
          <button type="button" className="text-button" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      {/* Announces changes to the total. */}
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
      {extracts.length === 0 ? (
        <p className="muted">Click an area on the map or list below.</p>
      ) : (
        <>
          <div className="totals">
            <p className="total">
              Estimated total: <strong>{sizeText(totals)}</strong>
            </p>
            {Object.keys(totals.byProvider).length > 1 && (
              <ul className="muted">
                {(Object.entries(totals.byProvider) as [ProviderId, SizeTotal][]).map(([p, t]) => (
                  <li key={p}>
                    {PROVIDER_LABELS[p]}: {formatCount(t.count, "extract", "extracts")}, {sizeText(t)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ul className="selected-list">
            {extracts.map((e) => {
              const page = safeHref(e.urls.page);
              const path = parents.get(e.key);
              return (
                <li key={e.key} className="selected-item">
                  <div className="selected-head">
                    <button type="button" className="link-button selected-name" onClick={() => onZoom(e.key)} aria-label={`Zoom to ${e.name}`}>
                      {e.name}
                    </button>
                    <button type="button" className="icon-button" aria-label={`Remove ${e.name} from selection`} onClick={() => onRemove(e.key)}>
                      ×
                    </button>
                  </div>
                  {path && <p className="row-path">{path}</p>}
                  <p className="row-meta">
                    <ProviderTag provider={e.provider} /> · {formatSize(e.sizeBytes)} · {replicationDetail(e)}
                  </p>
                  <ReplicationBadge extract={e} />
                  <div className="actions">
                    {page && (
                      <a href={page} target="_blank" rel="noopener noreferrer">
                        {PROVIDER_LABELS[e.provider]} page <span className="sr-only">for {e.name} (opens in a new tab)</span>
                      </a>
                    )}
                    {COPY_URLS.map(([field, label, what]) => {
                      const url = safeHref(e.urls[field]);
                      return url && <CopyButton key={field} label={label} description={`Copy ${what} for ${e.name}`} value={url} />;
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="muted small">Sizes are estimates from the providers' listings. Overlapping extracts are counted in full.</p>
        </>
      )}
    </section>
  );
}
