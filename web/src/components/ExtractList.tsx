import { memo, useId, useMemo } from "react";
import { formatCount, formatSize } from "../lib/format.ts";
import { type ListItem, type SortOrder, sortItems } from "../lib/search.ts";
import { ProviderTag } from "./ProviderTag.tsx";
import { ReplicationBadge } from "./ReplicationBadge.tsx";

interface Props {
  items: readonly ListItem[];
  selected: readonly string[];
  query: string;
  sort: SortOrder;
  onQueryChange: (q: string) => void;
  onSortChange: (s: SortOrder) => void;
  /** Click: select or deselect and zoom to the extract. */
  onActivate: (key: string) => void;
  onHighlight: (key: string | null) => void;
}

function ExtractListImpl({ items, selected, query, sort, onQueryChange, onSortChange, onActivate, onHighlight }: Props) {
  const id = useId();
  const sorted = useMemo(() => sortItems(items, sort), [items, sort]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <section className="panel extracts" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Extracts on the map</h2>
      <div className="list-controls">
        <label htmlFor={`${id}-search`} className="sr-only">
          Search extracts by name
        </label>
        <input
          id={`${id}-search`}
          type="search"
          placeholder="Search by name"
          value={query}
          autoComplete="off"
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <label htmlFor={`${id}-sort`} className="sr-only">
          Sort by
        </label>
        <select id={`${id}-sort`} value={sort} onChange={(e) => onSortChange(e.target.value as SortOrder)}>
          <option value="name">Name</option>
          <option value="size">Size</option>
        </select>
      </div>
      <p className="muted small" aria-live="polite">
        {formatCount(sorted.length, "extract", "extracts")}
        {query.trim() && ` matching “${query.trim()}”`}
      </p>
      <ul className="extract-list">
        {sorted.map(({ extract: e, coarser }) => (
          <li key={e.key}>
            <button
              type="button"
              className="row-button"
              aria-pressed={selectedSet.has(e.key)}
              onClick={() => onActivate(e.key)}
              onMouseEnter={() => onHighlight(e.key)}
              onMouseLeave={() => onHighlight(null)}
              onFocus={() => onHighlight(e.key)}
              onBlur={() => onHighlight(null)}
            >
              <span className="check" aria-hidden="true" />
              <span className="row-main">
                <span className="row-name">{e.name}</span>
                <span className="row-meta">
                  <ProviderTag provider={e.provider} /> · {formatSize(e.sizeBytes)}
                  {coarser && <> · coarser</>}
                </span>
                <ReplicationBadge extract={e} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const ExtractList = memo(ExtractListImpl);
