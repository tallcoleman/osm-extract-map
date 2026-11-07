import { useEffect, useState } from "react";

interface Props {
  /** Visible text, e.g. ".pbf". */
  label: string;
  /** Accessible name, e.g. "Copy .pbf URL for Quebec". */
  description: string;
  value: string;
}

type State = "idle" | "copied" | "failed";

const ICON_PATHS: Record<Exclude<State, "failed">, string> = {
  // Two overlapping sheets, the usual "copy" symbol.
  idle: "M5.5 5.5V3a1 1 0 0 1 1-1H13a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-2.5M3 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z",
  copied: "M3 8.5l3.2 3.2L13 4.8",
};

function Icon({ state }: { state: State }) {
  if (state === "failed") return null;
  return (
    <svg className="copy-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[state]} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyButton({ label, description, value }: Props) {
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(t);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  };

  return (
    <>
      <button type="button" className="copy-button" aria-label={description} title={value} onClick={copy}>
        <Icon state={state} />
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </>
  );
}
