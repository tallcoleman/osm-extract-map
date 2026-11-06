// Phase 2 report: how tree depth behaves as a "level" in each provider, and
// how heavy the boundary GeoJSON is. Reads a built release (no network).
//
// Usage: node updater/explore/levels-report.ts [releaseDir] [outFile]
//   releaseDir defaults to data/current; output goes to stdout unless outFile is given.

import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import {
  type BoundaryCollection,
  type BoundaryGeometry,
  type Extract,
  type Meta,
  PROVIDER_IDS,
  type ProviderId,
} from "../../shared/schema.ts";

const releaseDir = process.argv[2] ?? "data/current";
const outFile = process.argv[3];

const meta = JSON.parse(await readFile(path.join(releaseDir, "meta.json"), "utf8")) as Meta;
const extracts = JSON.parse(await readFile(path.join(releaseDir, meta.files.extracts), "utf8")) as Extract[];
const boundaries = new Map<ProviderId, BoundaryCollection>();
for (const p of PROVIDER_IDS) {
  const file = meta.files.boundaries[p];
  if (file) boundaries.set(p, JSON.parse(await readFile(path.join(releaseDir, file), "utf8")) as BoundaryCollection);
}
const providers = PROVIDER_IDS.filter((p) => boundaries.has(p));

const byKey = new Map(extracts.map((e) => [e.key, e]));
const children = new Map<string, Extract[]>();
for (const e of extracts) {
  if (e.parentKey === null) continue;
  const list = children.get(e.parentKey) ?? [];
  list.push(e);
  children.set(e.parentKey, list);
}
for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name));
/** A provider's extracts, without bundles (level views leave them out). */
const of = (p: ProviderId) => extracts.filter((e) => e.provider === p && !e.isBundle);
const bundlesOf = (p: ProviderId) => extracts.filter((e) => e.provider === p && e.isBundle);
const geometry = new Map<string, BoundaryGeometry>();
for (const fc of boundaries.values()) for (const f of fc.features) geometry.set(f.properties.key, f.geometry);

const out: string[] = [];
const line = (s = "") => out.push(s);
const table = (head: string[], rows: (string | number)[][]) => {
  line(`| ${head.join(" | ")} |`);
  line(`| ${head.map(() => "---").join(" | ")} |`);
  for (const r of rows) line(`| ${r.join(" | ")} |`);
  line();
};
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const size = (n: number | null) => {
  if (n === null) return "?";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
};

line(`# Levels report`);
line();
line(`Built from \`${releaseDir}\` (generated ${meta.generatedAt}).`);
line();

// --- Counts per depth --------------------------------------------------------
const maxDepth = Math.max(...extracts.map((e) => e.depth));
const depths = [...Array(maxDepth + 1).keys()];
line(`## Extracts per depth`);
line();
line(`"all / leaves" at each depth, after overrides. Bundles are counted separately.`);
line();
table(
  ["Provider", ...depths.map((d) => `Depth ${d}`), "Total", "Bundles"],
  providers.map((p) => {
    const list = of(p);
    return [
      p,
      ...depths.map((d) => {
        const at = list.filter((e) => e.depth === d);
        return `${at.length} / ${at.filter((e) => e.isLeaf).length}`;
      }),
      list.length,
      bundlesOf(p).length,
    ];
  }),
);
for (const p of providers) {
  const names = bundlesOf(p).map((e) => `\`${e.id}\``);
  if (names.length) line(`- ${p} bundles: ${names.join(", ")}`);
}
line();

// --- What each level view would show -----------------------------------------
line(`## Features shown per level view`);
line();
line(
  `Level *d* shows extracts at depth *d* ("normal") plus leaves above it ("coarser" fallback). "Smallest" shows every leaf.`,
);
line();
table(
  ["Provider", ...depths.map((d) => `Level ${d} (normal + coarser)`), "Smallest"],
  providers.map((p) => {
    const list = of(p);
    return [
      p,
      ...depths.map((d) => {
        const normal = list.filter((e) => e.depth === d).length;
        const coarser = list.filter((e) => e.depth < d && e.isLeaf).length;
        return `${normal} + ${coarser}`;
      }),
      list.filter((e) => e.isLeaf).length,
    ];
  }),
);

// --- Top level ---------------------------------------------------------------
const CONTINENTS = /^(africa|antarctica|asia|australia-oceania|oceania|central-america|europe|north-america|south-america)$/;
line(`## Top-level entries`);
line();
for (const p of providers) {
  const top = of(p).filter((e) => e.parentKey === null);
  const odd = top.filter((e) => !CONTINENTS.test(e.id));
  line(`- **${p}**: ${top.map((e) => `${e.name}${e.isLeaf ? " (leaf)" : ""}`).join(", ")}.`);
  line(`  - Not continents: ${odd.map((e) => `${e.name} (${children.get(e.key)?.length ?? 0} children)`).join(", ") || "none"}.`);
}
line();

// --- Geometry helpers --------------------------------------------------------
type Ring = number[][];
const polygons = (g: BoundaryGeometry): Ring[][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);
const vertexCount = (g: BoundaryGeometry) => polygons(g).reduce((n, poly) => n + poly.reduce((m, r) => m + r.length, 0), 0);
type BBox = [number, number, number, number];
const bboxOf = (g: BoundaryGeometry): BBox => {
  const b: BBox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polygons(g))
    for (const [x, y] of poly[0]!) {
      b[0] = Math.min(b[0], x!);
      b[1] = Math.min(b[1], y!);
      b[2] = Math.max(b[2], x!);
      b[3] = Math.max(b[3], y!);
    }
  return b;
};
const bboxes = new Map([...geometry].map(([k, g]) => [k, bboxOf(g)]));
const inRing = (x: number, y: number, ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y !== yj! > y && x < ((xj! - xi!) * (y - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
};
const inGeometry = (x: number, y: number, g: BoundaryGeometry) =>
  polygons(g).some((poly) => inRing(x, y, poly[0]!) && !poly.slice(1).some((hole) => inRing(x, y, hole)));
/** Share of `inner`'s outer-ring vertices (sampled) that fall inside `outer`. */
const coverage = (inner: BoundaryGeometry, outer: BoundaryGeometry) => {
  const pts = polygons(inner).flatMap((poly) => poly[0]!);
  const step = Math.max(1, Math.floor(pts.length / 200));
  let n = 0;
  let hit = 0;
  for (let i = 0; i < pts.length; i += step) {
    n++;
    if (inGeometry(pts[i]![0]!, pts[i]![1]!, outer)) hit++;
  }
  return hit / n;
};
const bboxInside = (a: BBox, b: BBox, slack = 0.5) =>
  a[0] >= b[0] - slack && a[1] >= b[1] - slack && a[2] <= b[2] + slack && a[3] <= b[3] + slack;

// --- Overlapping leaves ------------------------------------------------------
// In "smallest available" every leaf is drawn. A leaf that mostly contains
// another leaf of the same provider means the tree is missing a parent link.
line(`## Leaves that contain other leaves`);
line();
line(
  `Pairs where at least 90% of a smaller leaf's boundary vertices fall inside a larger leaf of the same provider (bundles left out). Each one draws on top of the other in the "smallest available" view. Enclaves (a city inside its surrounding region) are expected; a long list under one extract suggests a missing parent link or an unflagged bundle.`,
);
line();
for (const p of providers) {
  const leaves = of(p).filter((e) => e.isLeaf);
  const found = new Map<string, Extract[]>();
  for (const outer of leaves) {
    const ob = bboxes.get(outer.key)!;
    for (const inner of leaves) {
      if (inner === outer) continue;
      const ib = bboxes.get(inner.key)!;
      if (!bboxInside(ib, ob)) continue;
      if ((ib[2] - ib[0]) * (ib[3] - ib[1]) >= (ob[2] - ob[0]) * (ob[3] - ob[1])) continue;
      if (coverage(geometry.get(inner.key)!, geometry.get(outer.key)!) < 0.9) continue;
      const list = found.get(outer.key) ?? [];
      list.push(inner);
      found.set(outer.key, list);
    }
  }
  line(`### ${p}: ${found.size} containing leaves`);
  line();
  for (const [key, inner] of [...found].sort((a, b) => b[1].length - a[1].length)) {
    const e = byKey.get(key)!;
    const names = inner.map((i) => `\`${i.id}\``).sort();
    const shown = names.length > 12 ? [...names.slice(0, 12), `… ${names.length - 12} more`] : names;
    line(`- \`${e.id}\` (depth ${e.depth}) contains ${inner.length}: ${shown.join(", ")}`);
  }
  line();
}

// --- Sample trees ------------------------------------------------------------
type Root = string | { label: string; ids: RegExp; parent: string };
const SAMPLES: { title: string; geofabrik: Root[]; osmfr: Root[] }[] = [
  { title: "Canada", geofabrik: ["canada"], osmfr: ["north-america/canada"] },
  { title: "France", geofabrik: ["france"], osmfr: ["europe/france"] },
  {
    title: "USA",
    geofabrik: [{ label: "north-america › us*", ids: /^us($|-|\/)/, parent: "north-america" }],
    osmfr: [{ label: "north-america › us*", ids: /^north-america\/us/, parent: "north-america" }],
  },
  { title: "Germany", geofabrik: ["germany"], osmfr: ["europe/germany"] },
  { title: "Russia", geofabrik: ["russia"], osmfr: ["russia"] },
  {
    title: "Small countries",
    geofabrik: ["monaco", "luxembourg", "andorra", "malta", "liechtenstein", "iceland"],
    osmfr: ["europe/monaco", "europe/luxembourg", "europe/andorra", "europe/malta", "europe/liechtenstein", "europe/iceland"],
  },
];
const treeLines = (p: ProviderId, roots: Root[]): string[] => {
  const lines: string[] = [];
  const walk = (e: Extract, indent: number) => {
    const kids = children.get(e.key) ?? [];
    lines.push(`${"  ".repeat(indent)}${kids.length ? "▾" : "·"} ${e.name} [${e.depth}] ${size(e.sizeBytes)}`);
    for (const k of kids) walk(k, indent + 1);
  };
  for (const root of roots) {
    if (typeof root === "string") {
      const e = byKey.get(`${p}:${root}`);
      if (e) walk(e, 0);
      else lines.push(`(no ${root})`);
    } else {
      lines.push(`${root.label}`);
      for (const e of children.get(`${p}:${root.parent}`) ?? []) if (root.ids.test(e.id)) walk(e, 1);
    }
  }
  return lines;
};
line(`## Sample trees`);
line();
line(`\`▾\` has children, \`·\` is a leaf, \`[n]\` is depth, then the estimated size (\`?\` = not known yet).`);
line();
for (const s of SAMPLES) {
  const left = treeLines("geofabrik", s.geofabrik);
  const right = treeLines("osmfr", s.osmfr);
  const width = Math.max(28, ...left.map((l) => l.length)) + 4;
  line(`### ${s.title}`);
  line();
  line("```");
  line(`${"Geofabrik".padEnd(width)}OSM-FR`);
  for (let i = 0; i < Math.max(left.length, right.length); i++) line(`${(left[i] ?? "").padEnd(width)}${right[i] ?? ""}`.trimEnd());
  line("```");
  line();
}

// --- File sizes --------------------------------------------------------------
line(`## Boundary file sizes`);
line();
const rows: (string | number)[][] = [];
for (const p of providers) {
  const file = path.join(releaseDir, meta.files.boundaries[p]!);
  const raw = await readFile(file);
  const fc = boundaries.get(p)!;
  const counts = fc.features.map((f) => vertexCount(f.geometry));
  const leafVertices = fc.features.filter((f) => f.properties.isLeaf).reduce((n, f) => n + vertexCount(f.geometry), 0);
  rows.push([
    `\`${path.basename(file)}\``,
    mb((await stat(file)).size),
    mb(gzipSync(raw, { level: 6 }).length),
    fc.features.length,
    counts.reduce((a, b) => a + b, 0).toLocaleString("en"),
    leafVertices.toLocaleString("en"),
    Math.max(...counts).toLocaleString("en"),
  ]);
}
const extractsFile = path.join(releaseDir, meta.files.extracts);
const extractsRaw = await readFile(extractsFile);
rows.push([`\`${meta.files.extracts}\``, mb(extractsRaw.length), mb(gzipSync(extractsRaw, { level: 6 }).length), extracts.length, "—", "—", "—"]);
table(["File", "Raw", "Gzipped", "Features", "Vertices", "Leaf vertices", "Largest feature"], rows);

const text = out.join("\n");
if (outFile) {
  await writeFile(outFile, text);
  console.log(`Wrote ${outFile}`);
} else {
  console.log(text);
}
