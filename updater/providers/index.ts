// Builds one HTTP client and fetcher per provider, with each provider's politeness rules.

import type { ProviderId } from "../../shared/schema.ts";
import { HttpClient, type HttpClientOptions, type HttpMode, type Logger } from "../http.ts";
import type { Fetcher } from "../run.ts";
import { fetchGeofabrik } from "./geofabrik.ts";
import { fetchOsmfr } from "./osmfr.ts";

/** OSM-FR's robots.txt disallows crawling, so its requests are always slow and never retried. */
export const OSMFR_MIN_INTERVAL_MS = 2000;

export interface FetcherSettings {
  mode: HttpMode;
  cacheDir: string;
  allowedHosts: readonly string[];
  userAgent: string;
  /** Gap between requests; OSM-FR always uses at least OSMFR_MIN_INTERVAL_MS. */
  requestIntervalMs: number;
  skipSizes: boolean;
  osmfrExclude: readonly string[];
  logger: Logger;
}

export function httpOptionsFor(provider: ProviderId, s: FetcherSettings): HttpClientOptions {
  const base = {
    cacheDir: s.cacheDir,
    allowedHosts: s.allowedHosts,
    userAgent: s.userAgent,
    mode: s.mode,
    logger: s.logger,
  };
  if (provider === "osmfr") {
    // Any error, 403, 429 or 5xx stops OSM-FR for this run.
    return { ...base, minIntervalMs: Math.max(OSMFR_MIN_INTERVAL_MS, s.requestIntervalMs), maxRetries: 0 };
  }
  return { ...base, minIntervalMs: s.requestIntervalMs };
}

export function createFetchers(settings: FetcherSettings): {
  fetchers: Record<ProviderId, Fetcher>;
  clients: Record<ProviderId, HttpClient>;
} {
  const clients = {
    geofabrik: new HttpClient(httpOptionsFor("geofabrik", settings)),
    osmfr: new HttpClient(httpOptionsFor("osmfr", settings)),
  };
  const { logger } = settings;
  return {
    clients,
    fetchers: {
      geofabrik: () => fetchGeofabrik(clients.geofabrik, { skipSizes: settings.skipSizes, logger }),
      osmfr: () => fetchOsmfr(clients.osmfr, { exclude: settings.osmfrExclude, logger }),
    },
  };
}
