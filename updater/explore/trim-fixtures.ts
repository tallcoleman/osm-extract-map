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

// Pipeline fixtures: a small, self-consistent provider "site" for the
// golden-file test of runUpdate(). Responses are real, but listing rows
// outside the chosen subset are removed (nothing is added or edited).
// Saved as fixtures/pipeline/<host>/<path>, with "index.html" for directories.
const PIPELINE = "fixtures/pipeline";

// Extracts kept. africa/spain/ has no extract of its own; melilla keeps its
// extract row but loses its .poly row (an extract without a polygon).
const OSMFR_EXTRACTS = [
  "africa",
  "africa/bouvet_island",
  "africa/reunion",
  "africa/spain/ceuta",
  "africa/spain/melilla",
  "north-america",
  "north-america/canada",
  "north-america/canada/quebec",
  "north-america/canada/quebec/laval",
  // Russia is moved to depth 1 by level-overrides.json.
  "russia",
  "russia/northwestern_federal_district",
  "russia/northwestern_federal_district/kaliningrad_oblast",
];
const OSMFR_NO_POLY = new Set(["africa/spain/melilla"]);
// A polygon whose extract row is removed (a polygon without an extract).
const OSMFR_POLY_ONLY = new Set(["africa/algeria"]);
const OSMFR_DIRS = new Set([
  "",
  "africa",
  "africa/spain",
  "north-america",
  "north-america/canada",
  "north-america/canada/quebec",
  "russia",
  "russia/northwestern_federal_district",
]);
const INTERVAL_DIRS = new Set(["minute", "hour", "day"]);

const ROW_HREF = /^<a href="([^"]*)">/;

/** Removes listing rows that `keep` rejects. `keep` gets the decoded name, without a trailing "/". */
function trimListing(html: string, keep: (name: string, isDir: boolean) => boolean): string {
  const eol = html.includes("\r\n") ? "\r\n" : "\n";
  return html
    .split(eol)
    .filter((line) => {
      const m = ROW_HREF.exec(line);
      if (!m || m[1] === "../") return true;
      const href = decodeURIComponent(m[1]!);
      return keep(href.replace(/\/$/, ""), href.endsWith("/"));
    })
    .join(eol);
}

const stripSuffix = (name: string) => name.replace(/(-latest\.osm\.pbf|\.osm\.pbf\.md5|\.osm\.pbf|\.state\.txt|\.poly)$/, "");
const join = (rel: string, name: string) => (rel === "" ? name : `${rel}/${name}`);

async function savePipeline(url: string, body: string) {
  const u = new URL(url);
  const file = `${PIPELINE}/${u.hostname}${u.pathname}${u.pathname.endsWith("/") ? "index.html" : ""}`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

// Geofabrik: the 10 trimmed features, the top-level size page and canada.html.
// The other parent pages (north-america, europe, russia) are left out, so those
// children get no size.
await savePipeline("https://download.geofabrik.de/index-v1.json", JSON.stringify({ type: index.type, features }, null, 1) + "\n");
for (const page of ["https://download.geofabrik.de/index.html", "https://download.geofabrik.de/north-america/canada.html"]) {
  await savePipeline(page, await http.getText(page));
}

const extractSet = new Set(OSMFR_EXTRACTS);
let osmfrFiles = 0;
for (const rel of OSMFR_DIRS) {
  const html = await http.getText(`${OSMFR}/extracts/${rel === "" ? "" : `${rel}/`}`);
  await savePipeline(
    `${OSMFR}/extracts/${rel === "" ? "" : `${rel}/`}`,
    trimListing(html, (name, isDir) => {
      const p = join(rel, isDir ? name : stripSuffix(name));
      return isDir ? OSMFR_DIRS.has(p) || p === "merge" : extractSet.has(p);
    }),
  );
  const polys = await http.getText(`${OSMFR}/polygons/${rel === "" ? "" : `${rel}/`}`);
  await savePipeline(
    `${OSMFR}/polygons/${rel === "" ? "" : `${rel}/`}`,
    trimListing(polys, (name, isDir) => {
      const p = join(rel, isDir ? name : stripSuffix(name));
      if (isDir) return OSMFR_DIRS.has(p);
      return (extractSet.has(p) && !OSMFR_NO_POLY.has(p)) || OSMFR_POLY_ONLY.has(p);
    }),
  );
  osmfrFiles += 2;
}
for (const rel of [...OSMFR_DIRS, ...OSMFR_EXTRACTS].filter((v, i, a) => a.indexOf(v) === i)) {
  const url = `${OSMFR}/replication/${rel === "" ? "" : `${rel}/`}`;
  const html = await http.getText(url);
  await savePipeline(
    url,
    trimListing(html, (name, isDir) => isDir && (INTERVAL_DIRS.has(name) || OSMFR_DIRS.has(join(rel, name)) || extractSet.has(join(rel, name)))),
  );
  osmfrFiles++;
}
for (const p of OSMFR_EXTRACTS.filter((p) => !OSMFR_NO_POLY.has(p))) {
  const url = `${OSMFR}/polygons/${p}.poly`;
  await savePipeline(url, await http.getText(url));
  osmfrFiles++;
}
console.log(`Wrote pipeline fixtures: 3 Geofabrik files, ${osmfrFiles} OSM-FR files`);
