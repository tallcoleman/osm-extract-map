import { describe, expect, it } from "vitest";
import { formatBytes, formatCount, formatDate, formatSize } from "./format.ts";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KB"],
    [335 * 1024 ** 2, "335 MB"],
    [6_514_753_096, "6.1 GB"],
    [1.2 * 1024 ** 3, "1.2 GB"],
    [9.96 * 1024 ** 2, "10.0 MB"],
    [1023.7 * 1024 ** 2, "1.0 GB"],
    [3 * 1024 ** 4, "3.0 TB"],
    [2048 * 1024 ** 4, "2048 TB"],
  ])("%d → %s", (n, s) => {
    expect(formatBytes(n)).toBe(s);
  });
});

describe("formatSize", () => {
  it("says when a size is unknown", () => {
    expect(formatSize(null)).toBe("Size unknown");
    expect(formatSize(2048)).toBe("2.0 KB");
  });
});

describe("formatDate", () => {
  it("formats in UTC", () => {
    expect(formatDate("2026-11-06T23:30:00Z", "en-CA")).toBe("Nov 6, 2026");
  });

  it("handles a bad date", () => {
    expect(formatDate("nope")).toBe("unknown date");
  });
});

describe("formatCount", () => {
  it("picks singular or plural and adds separators", () => {
    expect(formatCount(1, "extract", "extracts")).toBe("1 extract");
    expect(formatCount(1598, "extract", "extracts")).toBe("1,598 extracts");
    expect(formatCount(0, "extract", "extracts")).toBe("0 extracts");
  });
});
