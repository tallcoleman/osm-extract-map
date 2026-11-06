import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export const REPO_URL = "https://github.com/tallcoleman/osm-extract-map";
export const USER_AGENT = `osm-extract-map/${pkg.version} (+${REPO_URL})`;

export const PROVIDER_HOSTS = ["download.geofabrik.de", "download.openstreetmap.fr"] as const;

export const DEFAULT_CACHE_DIR = ".cache/http";
