import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDERS } from "../shared/schema.ts";
import { type LevelOverrides, parseLevelOverrides } from "./levels.ts";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

export const REPO_URL = "https://github.com/tallcoleman/osm-extract-map";
export const USER_AGENT = `osm-extract-map/${pkg.version} (+${REPO_URL})`;

/** Hosts the updater may send requests to. */
export const PROVIDER_HOSTS: readonly string[] = Object.values(PROVIDERS).map((p) => p.downloadHost);

export const DEFAULT_CACHE_DIR = ".cache/http";

export const DEFAULT_DATA_DIR = "data";
export const DEFAULT_REQUEST_INTERVAL_MS = 1000;

/** Directory holding level-overrides.json and osmfr-exclude.json. */
export const CONFIG_DIR = fileURLToPath(new URL("./config/", import.meta.url));

export interface UpdaterConfig {
  levelOverrides: LevelOverrides;
  osmfrExclude: string[];
}

/** Checks a parsed osmfr-exclude.json: an array of extract paths like "europe/france". */
export function parseExcludeList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("osmfr-exclude.json must be an array of paths");
  for (const p of value) {
    if (typeof p !== "string" || !/^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/.test(p)) {
      throw new Error(`osmfr-exclude.json: "${String(p)}" is not an extract path like "europe/france"`);
    }
  }
  return value as string[];
}

export async function loadUpdaterConfig(dir = CONFIG_DIR): Promise<UpdaterConfig> {
  const read = async (name: string): Promise<unknown> => JSON.parse(await readFile(path.join(dir, name), "utf8"));
  return {
    levelOverrides: parseLevelOverrides(await read("level-overrides.json")),
    osmfrExclude: parseExcludeList(await read("osmfr-exclude.json")),
  };
}

/** Parses REQUEST_INTERVAL_MS; falls back to the default if unset. */
export function parseRequestInterval(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_REQUEST_INTERVAL_MS;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`REQUEST_INTERVAL_MS must be a non-negative integer, got "${value}"`);
  return n;
}
