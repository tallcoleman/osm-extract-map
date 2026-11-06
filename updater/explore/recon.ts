// Phase 0 reconnaissance: records provider data into the local cache and
// prints a report on the plan's assumptions.
//
// Only fetches paths that the provider's robots.txt allows. OSM-FR is not
// crawled at all (its robots.txt is "Disallow: /"); see docs/phase-0-findings.md.
//
// Usage: npm run recon [-- --offline]

import { DEFAULT_CACHE_DIR, PROVIDER_HOSTS, USER_AGENT } from "../config.ts";
import { HttpClient } from "../http.ts";

const GEOFABRIK_INDEX = "https://download.geofabrik.de/index-v1.json";
// One region page, to see whether its HTML lists sub-region sizes.
const GEOFABRIK_SAMPLE_PAGE = "https://download.geofabrik.de/north-america/canada.html";

interface GeofabrikFeature {
  properties: {
    id: string;
    parent?: string;
    name: string;
    urls: Record<string, string>;
    [key: string]: unknown;
  };
  geometry: { type: string; coordinates: unknown } | null;
}

function countVertices(coords: unknown): number {
  if (!Array.isArray(coords)) return 0;
  if (typeof coords[0] === "number") return 1;
  return coords.reduce((n: number, c) => n + countVertices(c), 0);
}

function tally<T>(items: T[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[String(i)] = (out[String(i)] ?? 0) + 1;
  return out;
}

async function main() {
  const offline = process.argv.includes("--offline");
  const http = new HttpClient({
    cacheDir: DEFAULT_CACHE_DIR,
    allowedHosts: PROVIDER_HOSTS,
    userAgent: USER_AGENT,
    mode: offline ? "offline" : "record",
    minIntervalMs: Number(process.env.REQUEST_INTERVAL_MS ?? 1000),
    freshForMs: 7 * 24 * 3600 * 1000,
  });

  const indexRes = await http.get(GEOFABRIK_INDEX);
  const index = JSON.parse(indexRes.body.toString("utf8")) as { features: GeofabrikFeature[] };
  const features = index.features;
  const byId = new Map(features.map((f) => [f.properties.id, f]));
  const depthOf = (id: string): number => {
    const parent = byId.get(id)?.properties.parent;
    return parent ? 1 + depthOf(parent) : 0;
  };
  const childCount = tally(features.map((f) => f.properties.parent).filter(Boolean));

  console.log("## Geofabrik index-v1.json");
  console.log(`size: ${indexRes.body.length} bytes, headers: ${JSON.stringify(indexRes.headers)}`);
  console.log(`features: ${features.length}`);
  console.log("property keys:", tally(features.flatMap((f) => Object.keys(f.properties))));
  console.log("url keys:", tally(features.flatMap((f) => Object.keys(f.properties.urls))));
  const noUpdates = features.filter((f) => !f.properties.urls.updates).map((f) => f.properties.id);
  console.log(`missing urls.updates: ${noUpdates.length}`, noUpdates.slice(0, 20));
  const noPbf = features.filter((f) => !f.properties.urls.pbf).map((f) => f.properties.id);
  console.log(`missing urls.pbf: ${noPbf.length}`, noPbf.slice(0, 20));
  const updateSamples = features.slice(0, 3).map((f) => f.properties.urls.updates);
  console.log("updates URL samples:", updateSamples);
  console.log("geometry types:", tally(features.map((f) => f.geometry?.type ?? "none")));
  const orphanParents = features.filter((f) => f.properties.parent && !byId.has(f.properties.parent));
  console.log("parents that don't resolve:", orphanParents.map((f) => f.properties.id));
  console.log("depth counts:", tally(features.map((f) => depthOf(f.properties.id))));
  console.log(
    "leaf depth counts:",
    tally(features.filter((f) => !childCount[f.properties.id]).map((f) => depthOf(f.properties.id))),
  );
  console.log("top level:", features.filter((f) => !f.properties.parent).map((f) => f.properties.id));
  const vertices = features.map((f) => countVertices(f.geometry?.coordinates));
  console.log(`total vertices: ${vertices.reduce((a, b) => a + b, 0)}, max: ${Math.max(...vertices)}`);
  const pagesMismatch = features.filter(
    (f) => f.properties.urls.pbf && !/-latest\.osm\.pbf$/.test(f.properties.urls.pbf),
  );
  console.log("pbf URLs not ending in -latest.osm.pbf:", pagesMismatch.map((f) => f.properties.urls.pbf));
  const offHost = features.filter((f) =>
    Object.values(f.properties.urls).some((u) => !u.startsWith("https://download.geofabrik.de/")),
  );
  console.log("features with URLs off download.geofabrik.de:", offHost.map((f) => f.properties.id));

  console.log("\n## Geofabrik sample region page");
  const page = await http.getText(GEOFABRIK_SAMPLE_PAGE);
  const sizeMatches = [...page.matchAll(/([\w-]+)-latest\.osm\.pbf[^\n]*?\(([\d.]+\s*[KMG]B)\)/g)];
  console.log(`size mentions: ${sizeMatches.length}`);
  for (const m of sizeMatches.slice(0, 20)) console.log(`  ${m[1]}: ${m[2]}`);

  http.logSummary();
}

await main();
