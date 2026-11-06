import { PROVIDERS } from "./schema.ts";

/** Returns the parsed URL if it is https on an allowed host, otherwise null. */
export function checkAllowedUrl(url: string, allowedHosts: readonly string[]): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  if (!allowedHosts.includes(parsed.hostname)) return null;
  return parsed;
}

/** Hosts that published links may point to: provider download hosts and homepages. */
export const LINK_HOSTS: readonly string[] = Object.values(PROVIDERS).flatMap((p) => [
  p.downloadHost,
  new URL(p.homepage).hostname,
]);
