import { useEffect, useRef } from "react";
import type { Extract } from "../../../shared/schema.ts";
import { formatSize } from "../lib/format.ts";
import { ProviderTag } from "./ProviderTag.tsx";

interface Props {
  extracts: readonly Extract[];
  selected: readonly string[];
  onToggle: (key: string) => void;
  onClose: () => void;
}

/** Shown when a click lands on several extracts, so the user can pick which to select. */
export function OverlapPicker({ extracts, selected, onToggle, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus the first choice on open. MapView remounts this for each click.
  useEffect(() => {
    ref.current!.querySelector<HTMLButtonElement>("li button")?.focus();
  }, []);

  useEffect(() => {
    const el = ref.current!;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="picker"
      role="dialog"
      aria-labelledby="picker-title"
    >
      <div className="picker-head">
        <h2 id="picker-title">{extracts.length} extracts here</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <ul>
        {extracts.map((e) => (
          <li key={e.key}>
            <button type="button" className="row-button" aria-pressed={selected.includes(e.key)} onClick={() => onToggle(e.key)}>
              <span className="check" aria-hidden="true" />
              <span className="row-main">
                <span className="row-name">{e.name}</span>
                <span className="row-meta">
                  <ProviderTag provider={e.provider} /> · {formatSize(e.sizeBytes)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
