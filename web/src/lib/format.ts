const UNITS = ["B", "KB", "MB", "GB", "TB"];

/**
 * Formats a size the way the providers show it: 1024-based, one decimal below
 * 10 ("1.2 GB", "335 MB").
 */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit > 0 && value < 10 ? 1 : 0;
  // Rounding can reach 1024 (e.g. 1023.6 MB); move up a unit then.
  if (Number(value.toFixed(digits)) >= 1024 && unit < UNITS.length - 1) return formatBytes(1024 ** (unit + 1));
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

export function formatSize(bytes: number | null): string {
  return bytes === null ? "Size unknown" : formatBytes(bytes);
}

export function formatDate(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown date";
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatCount(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
}
