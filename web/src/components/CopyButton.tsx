import { useEffect, useState } from "react";

interface Props {
  /** Visible text, e.g. ".pbf". */
  label: string;
  /** Accessible name, e.g. "Copy .pbf URL for Quebec". */
  description: string;
  value: string;
}

type State = "idle" | "copied" | "failed";

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
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </button>
      <span className="sr-only" role="status">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </>
  );
}
