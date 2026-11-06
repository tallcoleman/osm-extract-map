import { parseArgs } from "node:util";
import { PROVIDER_IDS, type ProviderId } from "../shared/schema.ts";
import type { HttpMode } from "./http.ts";

export interface UpdateArgs {
  providers: ProviderId[];
  mode: HttpMode;
  skipSizes: boolean;
}

/** Default providers. OSM-FR is fetched only when named, so a plain run never crawls it. */
export const DEFAULT_PROVIDERS: readonly ProviderId[] = ["geofabrik"];

export class ArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgsError";
  }
}

export const USAGE = `Usage: npm run update-data -- [--providers geofabrik,osmfr] [--offline | --record] [--skip-sizes]

  --providers   Comma-separated providers to fetch (default: geofabrik).
                Others are carried over from the previous release.
  --offline     Build from the HTTP cache only; a cache miss is an error.
  --record      Fetch online and cache every response.
  --skip-sizes  Skip the Geofabrik size pages.`;

export function parseUpdateArgs(argv: readonly string[]): UpdateArgs {
  let values;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        providers: { type: "string" },
        offline: { type: "boolean", default: false },
        record: { type: "boolean", default: false },
        "skip-sizes": { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new ArgsError((error as Error).message);
  }
  if (values.offline && values.record) throw new ArgsError("--offline and --record can't be combined");

  let providers = [...DEFAULT_PROVIDERS];
  if (values.providers !== undefined) {
    const names = values.providers.split(",").map((s) => s.trim()).filter(Boolean);
    for (const n of names) {
      if (!PROVIDER_IDS.includes(n as ProviderId)) throw new ArgsError(`Unknown provider "${n}"`);
    }
    if (names.length === 0) throw new ArgsError("--providers needs at least one provider");
    providers = [...new Set(names as ProviderId[])];
  }
  return {
    providers,
    mode: values.offline ? "offline" : values.record ? "record" : "online",
    skipSizes: values["skip-sizes"],
  };
}
