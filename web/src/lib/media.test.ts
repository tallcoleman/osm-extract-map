import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NARROW_SCREEN, useMediaQuery } from "./media.ts";

/** A matchMedia stand-in whose result can be changed, notifying listeners. */
function mockMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  })) as never;
  return {
    listeners,
    set(value: boolean) {
      matches = value;
      for (const l of listeners) l();
    },
  };
}

afterEach(() => {
  // @ts-expect-error jsdom has no matchMedia
  delete window.matchMedia;
});

describe("useMediaQuery", () => {
  it("is false without matchMedia", () => {
    // @ts-expect-error jsdom has no matchMedia
    delete window.matchMedia;
    expect(renderHook(() => useMediaQuery(NARROW_SCREEN)).result.current).toBe(false);
  });

  it("follows the query as it changes, and stops listening on unmount", () => {
    const media = mockMatchMedia(false);
    const { result, unmount } = renderHook(() => useMediaQuery(NARROW_SCREEN));
    expect(result.current).toBe(false);
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");
    act(() => media.set(true));
    expect(result.current).toBe(true);
    unmount();
    expect(media.listeners.size).toBe(0);
  });
});
