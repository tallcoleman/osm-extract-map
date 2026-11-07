import { useCallback, useSyncExternalStore } from "react";

/** Phone layout; matches the breakpoint in styles.css. */
export const NARROW_SCREEN = "(max-width: 767px)";

const hasMatchMedia = () => typeof window.matchMedia === "function";

/** Whether a CSS media query matches, updated when it changes. False without matchMedia. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!hasMatchMedia()) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => hasMatchMedia() && window.matchMedia(query).matches);
}
