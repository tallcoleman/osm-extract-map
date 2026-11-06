// Copies a small, trimmed subset of the recorded cache into fixtures/ for
// unit tests. Reads the cache only (no network).
//
// Usage: node updater/explore/trim-fixtures.ts

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CACHE_DIR, PROVIDER_HOSTS, USER_AGENT } from "../config.ts";
import { HttpClient } from "../http.ts";

// Covers: continents, a top-level non-continent with children (russia), a
// top-level leaf (antarctica), and Canadian provinces at depth 2.
const GEOFABRIK_IDS = [
  "north-america",
  "canada",
  "british-columbia",
  "quebec",
  "nunavut",
  "russia",
  "kaliningrad",
  "antarctica",
  "europe",
  "monaco",
];

const http = new HttpClient({
  cacheDir: DEFAULT_CACHE_DIR,
  allowedHosts: PROVIDER_HOSTS,
  userAgent: USER_AGENT,
  mode: "offline",
});

const index = JSON.parse(await http.getText("https://download.geofabrik.de/index-v1.json")) as {
  type: string;
  features: { properties: { id: string } }[];
};
const features = GEOFABRIK_IDS.map((id) => {
  const f = index.features.find((x) => x.properties.id === id);
  if (!f) throw new Error(`Missing Geofabrik id ${id}`);
  return f;
});

await mkdir("fixtures/geofabrik", { recursive: true });
await writeFile(
  "fixtures/geofabrik/index-v1.json",
  JSON.stringify({ type: index.type, features }, null, 1) + "\n",
);
await writeFile(
  "fixtures/geofabrik/canada.html",
  await http.getText("https://download.geofabrik.de/north-america/canada.html"),
);
console.log(`Wrote ${features.length} Geofabrik features and canada.html`);

// OSM-FR: listings are saved as <path>/index.html, files under their own path.
const OSMFR = "https://download.openstreetmap.fr";
const OSMFR_LISTINGS = [
  "/extracts/",
  "/extracts/africa/",
  "/extracts/africa/spain/", // a directory with no extract of its own
  "/extracts/merge/", // pre-merged extracts
  "/extracts/north-america/",
  "/extracts/north-america/canada/",
  "/extracts/north-america/canada/quebec/",
  "/polygons/",
  "/polygons/north-america/canada/",
  "/replication/",
  "/replication/africa/",
  "/replication/africa/algeria/",
  "/replication/africa/minute/",
];
const OSMFR_POLYS = [
  "/polygons/africa/bouvet_island.poly", // tiny
  "/polygons/africa/reunion.poly", // scientific notation
  "/polygons/europe/switzerland/zug.poly", // one hole
  "/polygons/north-america/canada/quebec.poly", // 2 outer rings, 8 holes
  "/polygons/north-america/canada/quebec/laval.poly",
  "/polygons/russia/far_eastern_federal_district/chukotka_autonomous_okrug.poly", // split at the antimeridian
];
for (const p of [...OSMFR_LISTINGS, ...OSMFR_POLYS]) {
  const file = `fixtures/osmfr${p}${p.endsWith("/") ? "index.html" : ""}`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, await http.getText(`${OSMFR}${p}`));
}
console.log(`Wrote ${OSMFR_LISTINGS.length} OSM-FR listings and ${OSMFR_POLYS.length} .poly files`);
