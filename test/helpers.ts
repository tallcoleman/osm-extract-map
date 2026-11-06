// Shared test helpers for the updater.

import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { getMockAgent } from "./mock-agent.ts";

export function makeLogger() {
  const lines: string[] = [];
  return {
    info: (m: string) => void lines.push(`info: ${m}`),
    warn: (m: string) => void lines.push(`warn: ${m}`),
    lines,
    /** Lines containing `text`. */
    find: (text: string) => lines.filter((l) => l.includes(text)),
  };
}

export function makeClock(start = Date.parse("2026-11-06T12:00:00Z")) {
  let t = start;
  return {
    now: () => t,
    date: () => new Date(t),
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export async function makeTempDir(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

function walkFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
}

/**
 * Serves every file under `root` (laid out as <host>/<path>, with index.html
 * standing for a directory URL) through the MockAgent, any number of times.
 * Returns the URLs served.
 */
export function serveFixtureSite(root: string, onlyHost?: string): string[] {
  const urls: string[] = [];
  for (const file of walkFiles(root)) {
    const rel = path.relative(root, file).split(path.sep);
    const host = rel[0]!;
    if (onlyHost !== undefined && host !== onlyHost) continue;
    let urlPath = `/${rel.slice(1).join("/")}`;
    // OSM-FR listings are directory URLs; Geofabrik's index.html is a real page.
    if (host !== "download.geofabrik.de" && urlPath.endsWith("/index.html")) urlPath = urlPath.slice(0, -"index.html".length);
    getMockAgent()
      .get(`https://${host}`)
      .intercept({ path: urlPath })
      .reply(200, readFileSync(file))
      .persist();
    urls.push(`https://${host}${urlPath}`);
  }
  return urls;
}
