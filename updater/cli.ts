// Entry point for `npm run update-data`. All logic lives in tested modules.

import { ArgsError, parseUpdateArgs, USAGE } from "./args.ts";
import {
  DEFAULT_CACHE_DIR,
  DEFAULT_DATA_DIR,
  loadUpdaterConfig,
  PROVIDER_HOSTS,
  parseRequestInterval,
  USER_AGENT,
} from "./config.ts";
import { loadLand } from "./gaps.ts";
import { createFetchers } from "./providers/index.ts";
import { LockError, runUpdate } from "./run.ts";

const logger = {
  info: (m: string) => console.log(`[${new Date().toISOString()}] ${m}`),
  warn: (m: string) => console.warn(`[${new Date().toISOString()}] WARN ${m}`),
};

async function main(): Promise<number> {
  let args;
  try {
    args = parseUpdateArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof ArgsError)) throw error;
    console.error(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  const config = await loadUpdaterConfig();
  const { fetchers, clients } = createFetchers({
    mode: args.mode,
    cacheDir: process.env.CACHE_DIR || DEFAULT_CACHE_DIR,
    allowedHosts: PROVIDER_HOSTS,
    userAgent: USER_AGENT,
    requestIntervalMs: parseRequestInterval(process.env.REQUEST_INTERVAL_MS),
    skipSizes: args.skipSizes,
    osmfrExclude: config.osmfrExclude,
    logger,
  });
  logger.info(`Updating ${args.providers.join(", ")} (${args.mode})`);
  try {
    const result = await runUpdate({
      dataDir: process.env.DATA_DIR || DEFAULT_DATA_DIR,
      providers: args.providers,
      fetchers,
      levelOverrides: config.levelOverrides,
      land: await loadLand(),
      logger,
    });
    return result.published ? 0 : 1;
  } catch (error) {
    if (!(error instanceof LockError)) throw error;
    logger.warn(error.message);
    return 1;
  } finally {
    for (const p of args.providers) {
      logger.info(`${p}:`);
      clients[p].logSummary();
    }
  }
}

process.exitCode = await main();
