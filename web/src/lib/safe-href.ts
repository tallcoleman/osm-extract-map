import { checkAllowedUrl, LINK_HOSTS } from "../../../shared/urls.ts";

/**
 * Returns the URL only if it is https on a provider host; otherwise null and
 * nothing is linked. A second check after updater validation.
 */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  return checkAllowedUrl(url, LINK_HOSTS)?.href ?? null;
}
