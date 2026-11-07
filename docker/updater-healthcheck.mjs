// Docker healthcheck for the updater: healthy while the published Geofabrik data
// is "ok" (not reused after a failed fetch) and was checked within
// UPDATE_MAX_AGE_DAYS (default 8: the weekly schedule plus a day).
// OSM-FR isn't checked, since it's only updated by hand.
import { readFileSync } from "node:fs";
import path from "node:path";

const maxDays = Number(process.env.UPDATE_MAX_AGE_DAYS || 8);
try {
  const meta = JSON.parse(readFileSync(path.join(process.env.DATA_DIR || "data", "current", "meta.json"), "utf8"));
  const geofabrik = meta.providers?.geofabrik;
  if (!geofabrik) throw new Error("no Geofabrik data published");
  const ageDays = (Date.now() - Date.parse(geofabrik.fetchedAt)) / 86_400_000;
  if (!(ageDays <= maxDays)) throw new Error(`Geofabrik last checked ${geofabrik.fetchedAt}, over ${maxDays} days ago`);
  if (geofabrik.status !== "ok") throw new Error(`Geofabrik is ${geofabrik.status} (the last fetch failed)`);
  console.log(`ok: Geofabrik last checked ${geofabrik.fetchedAt}`);
} catch (error) {
  console.error(`unhealthy: ${error.code === "ENOENT" ? "no release published yet" : error.message}`);
  process.exit(1);
}
