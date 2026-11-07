import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton.tsx";

const writeText = vi.fn<(s: string) => Promise<void>>();

function setup() {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<CopyButton label=".pbf" description="Copy .pbf URL for Monaco" value="https://download.geofabrik.de/m.pbf" />);
  return screen.getByRole("button", { name: "Copy .pbf URL for Monaco" });
}

afterEach(() => {
  vi.useRealTimers();
  writeText.mockReset();
});

describe("CopyButton", () => {
  it("copies, confirms, and resets after 2 seconds", async () => {
    vi.useFakeTimers();
    writeText.mockResolvedValue();
    const button = setup();
    expect(button.textContent).toBe(".pbf");
    expect(button.querySelector("svg.copy-icon")).toBeTruthy();
    expect(button.title).toBe("https://download.geofabrik.de/m.pbf");
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith("https://download.geofabrik.de/m.pbf");
    expect(button.textContent).toBe("Copied");
    expect(screen.getByRole("status").textContent).toBe("Copied");
    act(() => vi.advanceTimersByTime(2000));
    expect(button.textContent).toBe(".pbf");
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says when copying fails", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const button = setup();
    await act(async () => button.click());
    expect(button.textContent).toBe("Copy failed");
    expect(screen.getByRole("status").textContent).toBe("Copy failed");
  });
});
