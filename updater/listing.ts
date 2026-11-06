// Parser for nginx autoindex HTML listings (as served by download.openstreetmap.fr).
//
// Listing hrefs are untrusted. Each one is resolved against the directory URL
// and kept only if it stays on the same origin, under one of the allowed path
// prefixes, and has no ".." segments after decoding.

import type { Logger } from "./http.ts";

export interface ListingEntry {
  /** Decoded file or directory name, without a trailing slash. */
  name: string;
  url: string;
  isDir: boolean;
  /** ISO 8601 UTC, or null if the date couldn't be read. */
  modifiedAt: string | null;
  /** Approximate for rounded sizes like "311M"; null for directories or "-". */
  sizeBytes: number | null;
  /** The size as shown, e.g. "311M". */
  sizeText: string;
}

export class ListingParseError extends Error {
  constructor(url: string, reason: string) {
    super(`Could not parse directory listing ${url}: ${reason}`);
    this.name = "ListingParseError";
  }
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const SIZE_UNITS: Record<string, number> = { "": 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

const ROW = /<a href="([^"]*)">[^<]*<\/a>[ \t]+(\d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2})[ \t]+(\S+)/g;

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]!);
}

/** Parses "311M", "8G", "1234" or "-" into bytes (1024-based, as nginx rounds). */
export function parseSize(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)([KMGT]?)$/.exec(text);
  if (!m) return null;
  return Math.round(Number(m[1]) * SIZE_UNITS[m[2]!]!);
}

/** Parses nginx's "05-Nov-2026 01:41" (UTC) into ISO 8601. */
export function parseListingDate(text: string): string | null {
  const m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4}) (\d{2}):(\d{2})$/.exec(text);
  const month = m && MONTHS[m[2]!];
  if (!m || !month) return null;
  return `${m[3]}-${month}-${m[1]}T${m[4]}:${m[5]}:00Z`;
}

/** Returns the URL if it is safe to follow, otherwise null. */
export function resolveListingHref(href: string, dirUrl: string, allowedPrefixes: readonly string[]): URL | null {
  const base = new URL(dirUrl);
  let resolved: URL;
  try {
    resolved = new URL(href, base);
  } catch {
    return null;
  }
  if (resolved.origin !== base.origin) return null;
  if (resolved.search || resolved.hash) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(resolved.pathname);
  } catch {
    return null;
  }
  if (decoded.split("/").some((seg) => seg === ".." || seg === ".")) return null;
  if (decoded.includes("\\") || decoded.includes("\0")) return null;
  if (!allowedPrefixes.some((p) => resolved.pathname.startsWith(p))) return null;
  // Entries must be direct children of the directory being listed.
  if (!resolved.pathname.startsWith(base.pathname) || resolved.pathname === base.pathname) return null;
  const rest = resolved.pathname.slice(base.pathname.length).replace(/\/$/, "");
  if (rest.includes("/")) return null;
  return resolved;
}

export function parseListing(
  html: string,
  dirUrl: string,
  allowedPrefixes: readonly string[],
  logger: Logger,
): ListingEntry[] {
  const dirPath = new URL(dirUrl).pathname;
  if (!dirPath.endsWith("/")) throw new ListingParseError(dirUrl, "directory URL must end with /");
  const title = /<h1>Index of ([^<]*)<\/h1>/.exec(html);
  if (!title) throw new ListingParseError(dirUrl, "no 'Index of' heading");
  if (decodeEntities(title[1]!) !== decodeURIComponent(dirPath)) {
    throw new ListingParseError(dirUrl, `heading is for ${title[1]}`);
  }
  const pre = /<pre>([\s\S]*)<\/pre>/.exec(html);
  if (!pre) throw new ListingParseError(dirUrl, "no <pre> block");
  if (!pre[1]!.includes('<a href="../">../</a>')) throw new ListingParseError(dirUrl, "no parent link");

  const entries: ListingEntry[] = [];
  let rows = 0;
  for (const m of pre[1]!.matchAll(ROW)) {
    rows++;
    const href = decodeEntities(m[1]!);
    const url = resolveListingHref(href, dirUrl, allowedPrefixes);
    if (!url) {
      logger.warn(`Skipped unsafe listing href "${href}" in ${dirUrl}`);
      continue;
    }
    const isDir = url.pathname.endsWith("/");
    const name = decodeURIComponent(url.pathname.slice(dirPath.length).replace(/\/$/, ""));
    entries.push({
      name,
      url: url.href,
      isDir,
      modifiedAt: parseListingDate(m[2]!),
      sizeBytes: isDir ? null : parseSize(m[3]!),
      sizeText: m[3]!,
    });
  }

  // Every <a> other than the parent link should have matched a row. The
  // parent link was checked above, so there is always at least one match.
  const unmatched = pre[1]!.match(/<a href=/g)!.length - 1 - rows;
  if (unmatched > 0) throw new ListingParseError(dirUrl, `${unmatched} rows in an unexpected format`);
  return entries;
}
