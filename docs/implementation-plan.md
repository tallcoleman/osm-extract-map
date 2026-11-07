# Extracts Map: Implementation Plan

This plan builds on [design.md](design.md) and the decisions made during design review. Phases are ordered so that the two biggest unknowns (how depth levels behave across providers, and whether full-detail GeoJSON performs well enough) are tested early, before UI polish and deployment.

## Decisions carried forward

| Topic                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level filter           | Levels are derived from tree depth. The default view is "smallest available" (leaf extracts). When a branch has no extract at the selected depth, the deepest available ancestor-level leaf is shown with a distinct "coarser" style. Phase 2 confirmed raw depth works once Russia is moved to depth 1, Geofabrik's US states are put under `us`, and bundle extracts (e.g. `dach`) are flagged and left out of level views.                                                                                                                                                                                                                                                                                                                                                                |
| Download sizes         | Geofabrik: sizes parsed from each parent region's HTML page (rounded, e.g. "1.2 GB"), about 32 pages. HEAD requests on `.osm.pbf` were dropped because Geofabrik's robots.txt disallows `*.osm.pbf`. OSM-FR: sizes parsed from nginx directory listings (also rounded, e.g. `311M`). Sizes are estimates either way.                                                                                                                                                                                                                                                                                                                                                                |
| Overlap in size totals | Not specially handled, since only one depth level is shown at a time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Geometry format        | Full-detail GeoJSON, confirmed by the phase 3 performance check. Simplification, then PMTiles, only if real devices show a problem.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Change file frequency  | Each provider has an expected default interval (OSM-FR: minutely, Geofabrik: daily, both to be confirmed in phase 0). Extracts are flagged only when they differ from their provider's default or have no change files at all.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| URLs                   | Provider pages are the primary link. Key URLs (`.pbf` and replication base) are shown with copy buttons, next to the provider page link. The site helps people explore what providers offer; it does not replace their download pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| OSM-FR scope           | Everything in `extracts/`, matched with `polygons/` and `replication/`. Pre-merged extracts are excluded via a manual list unless they can be detected from structure. Whether to show them is revisited at the end.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Data schema            | Provider-agnostic, so other providers can be added later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Update schedule        | Geofabrik is refreshed weekly by the scheduled job. OSM-FR is refreshed only when manually triggered, never on a schedule, since a full refresh takes about 2,600 requests and its robots.txt disallows crawling. Each run carries the providers it doesn't fetch over unchanged from the previous release.                                                                                                                                                                                                                                                                                                                                                                         |
| URL state              | Not needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Deployment             | Two containers (static web server + updater) with a shared volume. No Coolify-specific features.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Politeness             | Rate-limited, conditional requests, request cache, recorded fixtures for development. User-Agent points to the public GitHub repo URL, never a personal email. Only paths allowed by each provider's robots.txt are fetched, with one deliberate exception: OSM-FR's robots.txt disallows everything, and the project owner chose to crawl it anyway using parameters that matched manual exploration. OSM-FR requests are kept to the minimum: 2s between requests, no retries (any error, 403, 429 or 5xx stops the run), listings and `.poly` files only, and no trees that aren't needed. No automatic updating from OSM-FR is planned unless permission can be obtained later. |
| Security               | Provider data is untrusted: URLs and crawl links are checked against a provider host allowlist, and cache files are named by hash. The web server can reach only published releases, sends a CSP, and is reachable only through the proxy. Images are pinned and checksum-verified.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Deferred features      | "What covers this point?" lookup, bundles and pre-merged OSM-FR extracts, PMTiles. A cross-provider compare view was dropped in phase 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Architecture

```
┌───────────────────────── docker compose ──────────────────────────┐
│                                                                    │
│  updater (node + supercronic)          web (nginx)                 │
│  ─────────────────────────────         ─────────────────────────   │
│  cron → fetch → build → validate       serves built Vite app       │
│        → write release → swap link     serves /data/ from volume   │
│                │                               ▲                   │
│                ▼                               │                   │
│        ├──────────────── data volume ──────────┘                   │
│        │  releases/<timestamp>/…                                    │
│        │  current → releases/<timestamp>   (atomic symlink swap)   │
│        │                                                            │
│        └──────────────── cache volume (updater only) ──            │
│           HTTP cache: bodies + ETag/Last-Modified                  │
└────────────────────────────────────────────────────────────────────┘
```

- The app is built once into the `web` image. Data updates never require a rebuild or redeploy.
- The HTTP cache lives in its own volume that only the updater mounts, so the web server can only ever reach published releases.
- The browser loads the app shell, then fetches `/data/meta.json` and the data files it references (nginx maps `/data/` to `current/`).

## Repository layout

```
/
├── docs/
│   ├── design.md
│   └── implementation-plan.md
├── package.json              # single package, npm
├── tsconfig.json
├── shared/
│   ├── schema.ts             # Extract types, shared by web + updater
│   └── urls.ts               # URL allowlist check, shared by web + updater
├── test/
│   ├── network-guard.ts      # vitest setup: blocks real network in tests
│   └── helpers.ts            # loggers, clocks, temp dirs, fixture site server
├── updater/
│   ├── config.ts             # User-Agent, provider hosts, cache dir
│   ├── cli.ts                # thin entry point: wires args, config and clients into runUpdate()
│   ├── args.ts               # command-line parsing (default: Geofabrik only)
│   ├── run.ts                # runUpdate(): full pipeline, dependencies passed in; lock file
│   ├── http.ts               # rate-limited, caching, conditional HTTP client
│   ├── providers/
│   │   ├── index.ts          # one HTTP client + fetcher per provider, with its politeness rules
│   │   ├── types.ts
│   │   ├── geofabrik.ts
│   │   └── osmfr.ts
│   ├── poly.ts               # .poly → GeoJSON
│   ├── listing.ts            # nginx autoindex HTML parser
│   ├── levels.ts             # depth computation + overrides
│   ├── replication.ts        # replication status
│   ├── validate.ts
│   ├── release.ts            # write release dir, swap symlink, prune
│   ├── gaps.ts               # land not covered at each level (coverage gaps)
│   ├── data/                 # ne_50m_land.geojson (Natural Earth, public domain)
│   ├── explore/              # one-off scripts (phase 0 recon, fixture trimming, phase 2 reports)
│   └── config/
│       ├── osmfr-exclude.json     # extra exclusions (merge/ is skipped by path)
│       └── level-overrides.json   # depth overrides and bundle list (phase 2)
├── web/
│   ├── vite.config.ts        # dev and preview servers also serve /data/ from data/current
│   ├── tsconfig.json
│   ├── debug.html            # phase 2 debug map (dev only; not in the production build)
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx           # loading/error states, then sidebar + map
│   │   ├── maplibre-worker.ts  # points MapLibre at its worker file (see phase 3 results)
│   │   ├── styles.css        # colour tokens on :root, checked by lib/contrast.test.ts
│   │   ├── components/       # MapView, ExtractList, SelectionPanel, Header, controls…
│   │   ├── lib/              # pure logic: levels, search, selection, badges, safeHref, load…
│   │   └── test/             # react-map-gl mock, test data, axe helper
│   └── public/               # config.json (gitignored) in development
├── fixtures/                 # small committed fixtures for unit tests
│   ├── pipeline/             # small self-consistent provider "site" for the pipeline test
│   └── expected/             # golden output files for the pipeline test
├── .oxlintrc.json            # lint rules, including jsx-a11y
├── docker/
│   ├── web.Dockerfile
│   ├── web-entrypoint.sh     # writes config.json from env at start
│   ├── nginx.conf
│   └── updater.Dockerfile
└── compose.yaml
```

A single package keeps tooling simple. If the web and updater dependencies diverge a lot, this can be split into npm workspaces later.

## Data model

Defined once in `shared/schema.ts` and used by both sides.

```ts
type ProviderId = "geofabrik" | "osmfr";

type ReplicationInterval = "minute" | "hour" | "day";

// Static per-provider settings, defined in shared code (not fetched)
interface ProviderConfig {
  id: ProviderId;
  name: string;
  homepage: string;
  expectedInterval: ReplicationInterval;  // default interval for this provider
}

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  geofabrik: { id: "geofabrik", name: "Geofabrik", homepage: "https://www.geofabrik.de/", expectedInterval: "day" },
  osmfr: { id: "osmfr", name: "OpenStreetMap France", homepage: "https://www.openstreetmap.fr/", expectedInterval: "minute" },
};

interface Extract {
  key: string;                // `${provider}:${id}`, globally unique
  provider: ProviderId;
  id: string;                 // provider-native id/path, e.g. "north-america/canada/quebec"
  name: string;               // display name
  parentKey: string | null;
  depth: number;              // 0 = top level, after overrides
  isLeaf: boolean;
  isBundle: boolean;          // repeats extracts also offered separately; left out of level views
  sizeBytes: number | null;   // null if unknown
  sizeCheckedAt: string | null;
  urls: {
    page: string | null;      // provider's human-facing page (primary link)
    pbf: string | null;
    poly: string | null;
    replication: string | null;  // replication base URL (dir containing state.txt)
  };
  replication: {
    available: boolean;
    intervals: ReplicationInterval[];  // all intervals offered
    // "none" = no change files; "differs" = expected interval not offered
    status: "expected" | "differs" | "none";
  };
}

interface Meta {
  generatedAt: string;
  schemaVersion: number;
  // A provider is absent until its first successful fetch (e.g. OSM-FR on a
  // fresh deploy, before the first manual run).
  providers: Partial<Record<ProviderId, {
    extractCount: number;
    fetchedAt: string;        // when this provider's data was last fetched, not when the release was built
    status: "ok" | "stale";   // "stale" = reused previous data after a fetch failure
  }>>;
  files: {
    extracts: string;                                // e.g. "extracts.json"
    boundaries: Partial<Record<ProviderId, string>>; // e.g. "boundaries-geofabrik.geojson"
    gaps?: string;                                   // "gaps.geojson"; absent if it couldn't be computed
  };
}
```

Output files in each release directory:

- `meta.json`: small, fetched first.
- `extracts.json`: all `Extract` records, no geometry. Drives the sidebar, search, selection and totals.
- `boundaries-<provider>.geojson`: one FeatureCollection per provider. Each feature has `key`, `depth`, `isLeaf`, `isBundle` and `name` as properties (enough for map styling and filtering), plus the geometry.
- `gaps.geojson`: land with no extract drawn, one MultiPolygon feature per provider set (`providers`: `"geofabrik"`, `"osmfr"` or `"geofabrik+osmfr"`) and `level`. Loaded after the rest, for the map's hatching (see Coverage gaps). Optional, so `SCHEMA_VERSION` stayed at 2.

Splitting by provider keeps each file smaller and lets the browser load providers in parallel.

## Updater pipeline

### HTTP client (`updater/http.ts`)

All network access goes through one client:

- **Rate limit:** one request at a time with a minimum gap between requests (default 1s, configurable via `REQUEST_INTERVAL_MS`).
- **User-Agent:** `osm-extract-map/<version> (+https://github.com/tallcoleman/osm-extract-map)`.
- **Conditional requests:** stores `ETag`/`Last-Modified` per URL in the cache and sends `If-None-Match`/`If-Modified-Since`. A `304` returns the cached body.
- **Cache file names:** each entry is named by a SHA-256 hash of the full URL, never by the URL path, so a crafted URL (`../`, `%2e%2e/`) can't write outside the cache directory.
- **Host allowlist:** every request, including each redirect target, must be `https:` on an allowlisted provider host (`download.geofabrik.de`, `download.openstreetmap.fr`). Anything else is refused and logged. Redirects are followed manually, up to 5 hops.
- **HEAD support** for size checks, with responses cached the same way.
- **Retries:** limited retries with exponential backoff on 5xx/network errors. Honours `Retry-After` on 429/503. Never retries 4xx.
- **Modes:** `online` (default), `offline` (serve from cache only, fail on a miss; used in development) and `record` (online, and always write to the cache).
- **Logging:** request count and bytes per run, so the load on providers is visible.

### Geofabrik (`updater/providers/geofabrik.ts`)

1. Conditional GET of `https://download.geofabrik.de/index-v1.json`. One request; a `304` means the boundaries are unchanged.
2. Map each feature to an `Extract`. Fields: `id`, `parent`, `name`, `urls.pbf`, `urls.updates`. Two index quirks are fixed first (phase 2): an id `<prefix>/<name>` whose prefix is a sibling extract is moved under that prefix (the index lists `us/alabama` beside `us`, under `north-america`, while Geofabrik's `us.html` lists the states), and a name equal to the id (`"us/alabama"`) is replaced by one derived from its last segment, using the OSM-FR name rules. Geometry comes from the feature itself. The page and `.poly` URLs are derived from the `.pbf` URL (`…-latest.osm.pbf` → `….html`, `….poly`); the `.poly` is linked, never fetched. A malformed index (bad JSON, missing fields, duplicate ids) fails the provider.
3. Sizes: fetch the HTML page of every extract that has children (31 as of phase 0), plus `index.html` for the top level (same table format, checked in phase 1), and parse the size shown next to each child's `.osm.pbf` link (e.g. `(1.2&nbsp;GB)`). Sizes are matched to extracts by `.pbf` URL, whichever page lists them (`russia` isn't on `index.html`; `europe.html` and `asia.html` both list it, confirmed by the first online run). Units are 1024-based: `canada.html` shows "6.1 GB" for a file of 6,514,753,096 bytes. Conditional GETs, since pages have ETags. A page that fails to load, or has no sizes in the expected format, is logged and its children get `sizeBytes: null`; it doesn't fail the provider. HEAD on `.osm.pbf` is not used: robots.txt disallows it.
4. Replication: `available = !!urls.updates`. The `updates` URL doesn't name an interval, so it is set from the provider's `expectedInterval` (daily). Geofabrik's [technical page](https://download.geofabrik.de/technical.html) confirms one update per day for every extract. `state.txt` and `*updates*` are disallowed by robots.txt, so they are never fetched.

### Replication status (both providers)

After each provider is mapped, set `replication.status` for every extract:

- `none`: no change files.
- `differs`: the provider's `expectedInterval` is not among `intervals` (e.g. an OSM-FR extract with only hourly or daily diffs).
- `expected`: otherwise. An extract that offers the expected interval plus others still counts as expected.

### OSM-FR (`updater/providers/osmfr.ts`)

1. Crawl the `extracts/` tree via nginx autoindex listings, one GET per directory. Collect `<name>.osm.pbf` entries (name, size, mtime), ignoring the identical `-latest` copies. Listing `href`s are untrusted: resolve each against the current directory URL, then follow it only if it stays on the same origin and under the expected prefix (`/extracts/`, `/polygons/` or `/replication/`) and has no `..` segments after decoding. Skip and log anything else.
2. List only the `polygons/` and `replication/` directories that are needed: a `polygons/` directory only if the same directory exists under `extracts/`, and a `replication/` directory only if it is an extract or a directory under `extracts/`. This skips `bbox/`, `planet/`, `merge/` and leftovers like `brazil/brazil/` without naming them.
3. An extract's replication intervals are the `minute/`, `hour/` and `day/` subdirectories in its `replication/<path>/` listing. Those directories are never entered (phase 0 sampled two and found `state.txt`), and `urls.replication` points to the expected interval's directory, or the first one offered.
4. Fetch each extract's `polygons/<path>.poly`, unless the cached copy's `Last-Modified` is at least as new as the date in the `polygons/` listing; then the cached copy is used with no request.
5. Skip `merge/` (the pre-merged extracts) by path: it is never listed. `config/osmfr-exclude.json` can exclude other paths (with everything under them), but starts empty.
6. Parent/child relationships come from the directory structure. A directory with no extract of its own (`africa/spain/`, `europe/seas/`) is skipped, and its children get the nearest ancestor that has one.
7. Report extracts that have no polygon file and polygons that have no extract. Log them rather than failing. An extract whose `.poly` is missing or doesn't parse is left out, and its children attach to the nearest ancestor that is kept.
8. Each extract's `urls.page` is its directory listing, the closest thing OSM-FR has to a download page. Display names come from directory names: `_` and `-` become spaces, words are capitalized except connectors after the first word (`and`, `of`, `the`, `de`, `du`, `del`, `og`, `y`, …), `d`/`l`/`o` before another word are elided (`cote_d_or` → "Cote d'Or", `o_higgins` → "O'Higgins"), and `us`, `usa` and `taaf` are upper-cased. Accents can't be recovered.

### `.poly` parser (`updater/poly.ts`)

- Format: a first line with the file name, then sections. Each section is a name line, `lon lat` coordinate lines, and `END`. A final `END` closes the file.
- Sections whose name starts with `!` are holes. Assign each hole to the outer ring that contains most of its vertices; if outer rings are nested, the smallest one wins a tie. (Testing only the first vertex failed on real data: Quebec's first hole starts exactly on the outer ring's edge.)
- Output is a GeoJSON `Polygon` or `MultiPolygon` with rings closed and wound per RFC 7946.
- Edge cases to test: multiple outer sections, holes, scientific notation, longitudes beyond ±180 (antimeridian-crossing regions such as Russia, Fiji and Alaska).
- Unit tests use small committed fixtures.

### Levels (`updater/levels.ts`)

- `depth` = number of ancestors (top-level entries are depth 0).
- `isLeaf` = has no children within the same provider.
- `config/level-overrides.json` has two fields:
  - `depth`: `key → depth` where raw depth gives a poor result; descendants follow. Currently `geofabrik:russia` and `osmfr:russia` → 1 (both providers list Russia beside the continents, but the Europe and Asia outlines already cover it). An override for a missing key is an error.
  - `bundles`: keys of extracts that repeat others the provider also offers separately, listed beside them rather than as their parent (Geofabrik's `dach` beside Germany, Austria and Switzerland). They get `isBundle: true` and level views leave them out. A bundle missing from the data is logged, not an error, since providers drop bundles now and then and the config ships inside the image.
- Bundles are picked by hand from the phase 2 overlap check, and only where their parts cover the same land (checked by sampling points). Some bundles reach further out to sea than their parts (e.g. `us-west` off the Pacific coast), so hiding them leaves bits of open sea uncovered in the level views. That's acceptable, since there is little OSM data there. A future "what covers this point?" lookup should still include bundles. Geofabrik: `alps`, `britain-and-ireland`, `dach`, `great-britain`, `sea`, `south-africa-and-lesotho`, `us-midwest`, `us-northeast`, `us-south`, `us-west`. OSM-FR: `asia/israel_and_palestine`, `asia/india/dadra_and_nagar_haveli_and_daman_and_diu`. OSM-FR's `asia/indonesia/papua` overlaps the newer Papua provinces but also covers today's Papua, which has no other extract, so it isn't a bundle.

### Validation (`updater/validate.ts`)

The new release is published only if all of these pass:

- Each provider fetched in this run has an extract count above 0 that hasn't dropped more than 10% from the previous release. Providers carried over unchanged are not re-checked.
- Keys are unique, and depth computation succeeds (no parent cycles, no overrides for missing keys).
- Every extract has a geometry, and each geometry is parseable with a non-empty bounding box.
- Every `parentKey` resolves to an existing extract.
- Every URL in `urls` parses with `new URL()`, uses `https:`, and points to its own provider's download host (each `homepage` must be `https:` on an allowlisted host). Provider data is untrusted, so this stops a `javascript:` or off-site URL from being published as a link. A failing extract is dropped and logged; if more than 10% of a provider's extracts fail, the provider fails validation.
- `meta.json` matches the schema version.

Each run fetches only the providers it was asked for (see [Running the updater](#running-the-updater)). Every other provider is copied from the previous release with its `fetchedAt` and `status` unchanged, or left out if the previous release doesn't have it.

If a requested provider fails to fetch, reuse its data from the previous release and mark it `status: "stale"` in `meta.json`. If validation fails, keep the current release, log the reason and exit non-zero.

### Coverage gaps (`updater/gaps.ts`)

The map hatches land where no extract is drawn for the providers and level shown (added after phase 3 review). Computed in the updater on every run, from the final boundaries (fetched and carried over):

- For each provider, and for both together, at each level (15 features in `gaps.geojson`, keyed by `providers`, `"geofabrik"`, `"osmfr"` or `"geofabrik+osmfr"`, and `level`): Natural Earth 1:50m land minus the union of the extracts that level draws, using the same rule as the map (`shared/levels.ts`). Both together is the intersection of the two providers' gaps.
- Land only, so the oceans outside every extract aren't hatched. The land file is `updater/data/ne_50m_land.geojson` (Natural Earth v5.1.2, public domain, 1.6 MB).
- Polygon operations use `polyclip-ts` (MIT). Boundaries are snapped to a 0.001° grid (about 100 m) first: OSM-FR's detailed outlines otherwise hit a known robustness bug in the polygon-clipping family. Pieces under 10 km² are dropped; they're mostly slivers where the land and extract outlines differ along coasts.
- About 35 s per run on the full data; the file is about 2.7 MB (0.8 MB gzipped). If the computation fails, the release goes out without `gaps.geojson` (`meta.files.gaps` is optional) and the map has no hatching.
- What it showed (2026-11-07): Geofabrik leaves almost no land uncovered at any level (under 0.1%, mostly small islands), and both providers together leave practically none. OSM-FR alone leaves about 28% of land uncovered at "Smallest available" (Antarctica, Greenland, Alaska, most of the US mainland, Libya, Peru, much of Central Asia) and about 8% at "Continent" (mostly Antarctica).
- Meaning: "nothing drawn at this level", not "no extract at all". Where a bigger extract exists but isn't drawn at the level (e.g. land inside OSM-FR's North America with no US extract), it's hatched too, which matches what the map shows.

### Release (`updater/release.ts`)

1. Write all files to `releases/<timestamp>/`.
2. Point a temporary symlink at it, then `rename()` it over `current`. The rename is atomic, so nginx never serves a half-written release.
3. Prune old releases, keeping the last 3.

### Running the updater

- `npm run update-data`: online run for Geofabrik only. This is what the weekly schedule runs.
- `npm run update-data -- --providers osmfr`: online run for OSM-FR only, manual. About 2,620 requests (one replication listing and one `.poly` per extract, plus about 230 directory listings), taking roughly 1.5 hours at OSM-FR's 2s spacing. `.poly` files are re-fetched only when the `polygons/` listing shows a newer date than the cached copy, which cuts later runs to about 1,420 requests.
- `npm run update-data -- --providers geofabrik,osmfr`: both, manual.
- OSM-FR is never fetched unless `--providers` names it, so a plain run can't start an OSM-FR crawl by accident.
- OSM-FR requests use a 2s minimum gap and no retries (any error, 403, 429 or 5xx stops OSM-FR for that run and marks it `stale`), whatever `REQUEST_INTERVAL_MS` is set to.
- `npm run update-data -- --offline`: build from the cache only (development).
- `npm run update-data -- --record`: refresh the local cache from the providers (used rarely, to refresh fixtures).
- `npm run update-data -- --skip-sizes`: skip the size pass (faster during development).
- Environment: `DATA_DIR` (default `data/`, gitignored), `CACHE_DIR` (default `.cache/http/`) and `REQUEST_INTERVAL_MS`.
- A run takes a lock file (`update.lock`) in the data directory and exits non-zero if another run holds it. A lock older than 12 hours is treated as left over from a crash and replaced.

## Frontend

### Stack

Vite + React + TypeScript + `react-map-gl/maplibre`. No state library; React state plus context is enough for this size.

### Runtime config

At container start, `web-entrypoint.sh` writes `config.json` (`{ "maptilerKey": "…" }`) from the `MAPTILER_KEY` env var. The app fetches it on load. The key can then change without rebuilding the image. In development, Vite serves a local `config.json` that is gitignored.

- The entrypoint builds the JSON with `jq -n --arg k "$MAPTILER_KEY" '{maptilerKey: $k}'`, not string interpolation, so the value is always escaped correctly.
- The key is public by design: every visitor can read it. In the MapTiler dashboard, restrict the production key to the production origin, and use a separate key for development restricted to `localhost`.

### Map layers

For each provider: a GeoJSON source, a line layer, a fill layer for hover/selection, and a line layer for the selected outline.

- **Provider colours:** two colourblind-safe hues, also told apart by line pattern (e.g. solid vs. slightly offset with `line-offset`), so overlapping outlines stay legible when both providers are shown.
- **Fills:** none by default (so overlap doesn't get muddy), a faint fill on hover and a stronger fill when selected. Hover and selection use MapLibre feature state (`promoteId: "key"` on each source), not layer filters: changing a filter rebuilds the layer, which lagged behind the cursor in the phase 2 debug map, while feature state only repaints. Hover is also debounced slightly (about 60 ms).
- **Level filter** (applied with a MapLibre `filter` expression on `depth`/`isLeaf`/`isBundle`, with no data reload; bundles are always left out until phase 6 decides how to show them):
  - Level *d* shows features where `depth == d`, plus features where `depth < d && isLeaf` in the **coarser** style (dashed line, lower opacity). This is the fallback for branches with no extract at depth *d*.
  - "Smallest available" (the default) shows every leaf, in the normal style.
- **Labels:** none (decided in phase 3). Two providers' outlines plus the basemap's own place labels are already busy, and names are in the hover tooltip and the extract list.
- **Selected outline:** a line layer filtered to the selected keys (`["in", ["get", "key"], ["literal", keys]]`), with no level filter, so a selected extract stays outlined at every level. Its filter changes only on clicks. Drawing every feature there and hiding unselected ones with feature state made panning noticeably slower.
- **Provider toggle:** hides a provider's layers with `visibility: none` rather than removing its source, so switching is instant and feature state is kept.
- **Coverage gaps:** a fill layer with a diagonal hatch pattern (`fill-pattern`, built pixel by pixel in `web/src/lib/hatch.ts` and added with `addImage` on load) over `gaps.geojson`, filtered to the feature for the visible providers and level. The file is fetched after the main data so the first render doesn't wait for it, and the legend gets "No extract shown at this level" once it's loaded.

### Controls (sidebar on desktop, bottom sheet on mobile)

- **Header:** site name, a one-line explanation ending with the GitHub link, and a "Providers:" row linking to https://www.geofabrik.de/ and https://www.openstreetmap.fr/, each with the date we last checked it (the provider's `fetchedAt`, since OSM-FR is refreshed less often; worded "last checked" so it isn't read as how fresh the provider keeps its data), "no data yet" for a provider not loaded, and a warning badge if a provider is `stale` or its boundaries failed to load. These sit at the top because the extract list can be very long; there is no footer.
- **Provider toggle:** Both / Geofabrik / OSM-FR (default Both). A provider with no data yet is disabled.
- **Level selector:** Smallest available (default) / Continent / Country / Region / Sub-region, mapping to depth 0–3 (confirmed in phase 2). A legend, under its own "Legend" label, explains the coarser style.
- **Search box:** filters the visible extracts by name.
- **Extract list:** visible extracts sorted by name or size, each with its parent regions (e.g. "North America › Canada › Quebec"). This is the keyboard-accessible alternative to clicking on the map. Hovering a row highlights the polygon; clicking zooms to it and toggles selection.
- **Selection panel:**
  - Selected extracts, each with parent regions, provider, size, replication badge, a link to the provider page, and copy buttons (with a copy icon) for `.pbf` and the replication base URL (no `.poly`: boundary files are rarely what people pass to other tools). Every link goes through a `safeHref()` helper that renders a URL only if it is `https:` on an allowlisted provider host, as a second check after updater validation.
  - Total estimated download size, broken down by provider.
  - A "Clear" button.

### Map interaction

- Click a polygon to toggle selection. If several features are under the cursor (common when both providers are shown), show a small popup listing them so the user can choose.
- Hover shows a tooltip with name, provider and size. It's placed after measuring itself, so it stays inside the map (flipping to the other side of the cursor, or shifting along the edge on a narrow map), and it hides while the map pans or zooms.
- Zoom buttons and a location button (MapLibre's geolocate control) sit at the top right.
- Replication badges are based on `replication.status`:
  - `none`: warning badge, "No change files".
  - `differs`: notice badge naming the interval, e.g. "Hourly updates only (OSM-FR default is minutely)".
  - `expected`: no badge. The interval appears as a plain detail in the selection panel.
- The about modal and legend state each provider's default interval, so a missing badge clearly means "normal for this provider".

### Attribution

MapLibre's attribution control collects the `attribution` strings from every loaded source. The MapTiler basemap style already brings its own (typically "© MapTiler © OpenStreetMap contributors"). So attribution starts with a check, and only what's missing gets added:

1. In phase 3, load the chosen basemap style and record what attribution it shows by default. *MapTiler "dataviz" shows "© MapTiler © OpenStreetMap contributors".*
2. Add anything still needed as the `attribution` property on our own GeoJSON sources, not as separate page text. It then appears in the same control, and only while that provider's layer is loaded. Expected additions: boundary credit for Geofabrik and OpenStreetMap France, linking to their sites.
3. Don't duplicate credits the basemap already shows (e.g. "© OpenStreetMap contributors"). *The sources add "Geofabrik extracts" and "OpenStreetMap France extracts", each linking to the provider's homepage. The full control reads "Geofabrik extracts | OpenStreetMap France extracts | © MapTiler © OpenStreetMap contributors", and MapLibre collapses it on narrow screens.*
4. The about modal can explain the data sources in more detail, but the map's attribution control is the source of truth.

### Accessibility and mobile

- All map actions can also be done from the extract list.
- Controls are keyboard-navigable with visible focus, and badges have text labels (not colour alone).
- Below roughly 768px, the sidebar becomes a draggable bottom sheet with collapsed, half and full positions.
- Tap targets are at least 44px.

## Deployment

### `web` container

- Multi-stage Dockerfile: a Node stage installs with `npm ci` and builds the Vite app, then copies `dist/` into `nginx:alpine`. The final stage also installs `jq` for the entrypoint.
- nginx config:
  - The data volume is mounted read-only. `/data/` serves `current/` from it, written as `location /data/ { alias /srv/data/current/; }` with a trailing slash on both. Without both slashes, a request such as `/data../` can reach the parent directory. `autoindex` stays off.
  - Security headers on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a Content Security Policy that allows only what MapLibre and MapTiler need, starting from `default-src 'self'; connect-src 'self' https://api.maptiler.com; img-src 'self' data: blob: https://api.maptiler.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. MapLibre 6 loads its worker as a same-origin module file (`assets/maplibre-gl-worker-<hash>.mjs`), hence `worker-src 'self'`. If a `Permissions-Policy` header is added later, it must allow `geolocation=(self)` for the map's location button. The "dataviz" style loads its style, tiles, glyphs and sprite from `api.maptiler.com` only (checked in phase 3).
  - Hashed app assets: `Cache-Control: public, max-age=31536000, immutable`.
  - `index.html`, `config.json` and `/data/*`: `Cache-Control: no-cache` (revalidate with ETag).
  - `gzip on` for `application/json`, `application/geo+json` and JS/CSS. GeoJSON compresses very well.
  - Map `.geojson` to `application/geo+json`.

### `updater` container

- `node:22-alpine` plus `supercronic`, with dependencies installed via `npm ci`.
- `CRON_SCHEDULE` env var (default weekly, e.g. `0 3 * * 1`). The scheduled job runs `npm run update-data`, which fetches Geofabrik only.
- On start: if `current` doesn't exist, run once immediately (Geofabrik only) so a fresh deploy isn't empty. OSM-FR appears after the first manual OSM-FR run.
- The data volume and the cache volume are mounted read-write.
- Runs as the image's non-root `node` user; both volumes are owned by it.
- The image must include `updater/data/ne_50m_land.geojson` (the coverage gaps need it), and `polyclip-ts` is a runtime dependency.

### Supply chain and image hardening (both images)

- Pin base images (`node`, `nginx`) by digest, with the tag kept alongside in a comment for readability. Update them deliberately.
- Download `supercronic` from a pinned release and check it against the SHA1 checksum published with that release. The build fails on a mismatch.
- The updater's runtime stage installs with `npm ci --omit=dev`, so test and build tools never ship in the image. Try `--ignore-scripts` in every `npm ci`; keep it wherever the build still works.
- The shared `test` stage is never the final stage of either Dockerfile.
- Commit `package-lock.json` and review its diff when dependencies change.

### Manual update

- Geofabrik: `docker compose exec updater npm run update-data`.
- OSM-FR: `docker compose exec updater npm run update-data -- --providers osmfr`. It takes about 1.5 hours, so run it detached (`docker compose exec -d …`) or in a terminal that stays open.

This is plain Docker; any host, including Coolify's terminal, can run it. A run that starts while another is in progress exits immediately (lock file on the data volume, built in phase 1).

### `compose.yaml`

- Two services and two named volumes: `data` (releases, shared) and `cache` (updater only).
- `web` uses `expose: ["80"]`, not `ports`, so it isn't published on the host and is only reachable through the reverse proxy. TLS and the domain are handled by that proxy (Coolify's in production). For local testing, a `compose.override.yaml` can add a `ports` mapping bound to `127.0.0.1`.
- Env vars: `MAPTILER_KEY` (web); `CRON_SCHEDULE` and `REQUEST_INTERVAL_MS` (updater; Geofabrik only, since OSM-FR always uses at least 2s).

## Testing

### Approach

| Area | Target | Tools |
| --- | --- | --- |
| Updater and shared code (`updater/`, `shared/`) | 100% line, branch and function coverage, enforced in CI and the Docker build | vitest, `@vitest/coverage-v8`, undici `MockAgent` |
| Frontend logic and components (`web/src/`) | Good coverage of key features and accessibility; no hard threshold | vitest (jsdom), React Testing Library, `@testing-library/user-event`, `axe-core` |
| End-to-end / browser | None. Replaced by a short manual release checklist | — |
| Static checks | Type check and lint must pass | `tsc --noEmit`, oxlint with its jsx-a11y and react plugins |

Vitest is set up with two projects: `updater` (Node environment) and `web` (jsdom environment). A single `npm test` runs both.

### Updater: 100% coverage, and coverage isn't the whole goal

Coverage thresholds are set to 100% for `updater/**` and `shared/**`. Only two things are excluded: `updater/explore/` (one-off scripts) and `updater/cli.ts`, a thin entry point that parses arguments and calls `runUpdate()`. All real logic goes in modules that take their dependencies (HTTP client, clock, filesystem root, logger) as parameters, so they can be tested without global mocks.

100% coverage shows every line ran, not that every failure is handled. Tests must also cover each case in this list explicitly:

- **No real network, ever.** A global test setup installs an undici `MockAgent` with `disableNetConnect()`, so any unmocked request fails the test.
- **HTTP client:**
  - minimum spacing between requests (fake timers) and one request in flight at a time;
  - the exact `User-Agent` string;
  - conditional headers sent when cached; a `304` returns the cached body;
  - retries with backoff on 5xx and network errors, giving up after the limit;
  - `Retry-After` honoured (both seconds and HTTP-date forms); no retry on 4xx;
  - offline mode fails on a cache miss; record mode writes to the cache;
  - HEAD with redirects; a missing `Content-Length` gives `sizeBytes: null`;
  - requests and redirects to a non-allowlisted host or to `http:` are refused; more than 5 redirects fail;
  - cache file names are hashes, and URLs containing `../` or `%2e%2e/` never create files outside the cache directory.
- **`.poly` parser:**
  - committed real-world fixtures;
  - multiple outer rings, holes assigned to the correct outer ring, scientific notation, longitudes beyond ±180, ring closing and winding order;
  - malformed input (missing `END`, non-numeric coordinates, empty file) gives a clear error.
  - A property-based round-trip test (`fast-check`): generate a polygon, write it as `.poly`, parse it, and compare.
- **Listing parser:** recorded nginx autoindex HTML; files vs. directories; sizes and dates; unexpected HTML gives a clear error, never a silently empty result; absolute, off-origin, out-of-prefix and `..` hrefs are skipped and logged.
- **Providers:**
  - mapping from fixture data to `Extract` records, including derived page and `.poly` URLs;
  - exclude list applied; parent/child links;
  - extracts without polygons, and polygons without extracts, are logged and not fatal;
  - replication intervals detected from listings.
- **Replication status:** table-driven tests for `expected` / `differs` / `none`, including "expected interval plus others".
- **Levels:** depth and leaf computation; overrides applied; an override pointing to a missing key is an error; bundles flagged, and a missing bundle is reported, not an error.
- **Validation:** each rule passes and fails on its own, including `javascript:`, `data:`, `http:` and off-host URLs being rejected; one provider failing reuses the previous data marked `stale`; both failing keeps the current release; providers not requested are carried over unchanged (and left out if the previous release lacks them); a plain run never makes OSM-FR requests.
- **Release:** runs against a real temporary directory. Covers writing, the atomic symlink swap, pruning to 3 releases, and a failure mid-write leaving `current` untouched.
- **Pipeline:** `runUpdate()` in offline mode over the committed fixture subset produces output that matches committed golden files (`fixtures/expected/`). Output changes then show up as a reviewable diff.

### Frontend

MapLibre needs WebGL, which jsdom doesn't have. So map behaviour is split into two parts:

- **Pure logic modules (`web/src/lib/`), where most frontend tests go:**
  - building the level filter expression (including the coarser fallback) and provider filters;
  - the selection reducer, size totals and size formatting;
  - badge text from `replication.status`;
  - search and sorting;
  - `safeHref()`: allowlisted `https:` URLs pass, and `javascript:`, `data:`, `http:` and off-host URLs render no link;
  - the list of candidates for the overlap picker;
  - parent region paths, the hatch pattern and tooltip placement;
  - loading data/config, including error and stale states.
- **The map component:** `react-map-gl` is mocked. Tests check that the right sources, layers, filters and event handlers are passed in, and that a mocked click with several features opens the overlap picker. Real rendering is checked by hand (see the checklist below).

Component tests (React Testing Library + user-event) cover the provider toggle, level selector, search, extract list, selection panel, copy buttons (clipboard mocked), about modal, bottom sheet, and the error/stale notices.

Accessibility tests:

- axe checks (`axe-core`, called directly through a small helper in `web/src/test/data.ts`) on each major component in its main states (empty, with selection, with warnings, error).
- **Keyboard-only flows:** reach every control with Tab; select and deselect extracts from the list with Enter/Space; open and close the modal with focus trapped inside and returned afterwards; Escape closes the overlap picker and modal.
- **Screen reader text:** badges have text labels; changes to the selection total are announced through an `aria-live` region; icon-only buttons have accessible names.
- **Colour contrast:** axe can't measure contrast in jsdom. Instead, a unit test checks the colour tokens directly: at least 4.5:1 for text and badges against their backgrounds, and at least 3:1 for the provider line colours against a representative basemap background colour.

### Release checklist (manual, instead of end-to-end tests)

Run before the first deploy and after major frontend changes:

- [ ] Map loads real data with both providers at every level, including the coarser fallback styling.
- [ ] Selection, totals, copy buttons and provider links work.
- [ ] The attribution control shows basemap, OSM and provider credits once each, at desktop and phone widths.
- [ ] Phone check (real device or emulation): bottom sheet, tapping polygons, overlap picker.
- [ ] Quick screen reader pass (VoiceOver) through the main flow.
- [ ] Performance is still acceptable with both providers at leaf level, including on a real phone (phase 3 only measured headless Chrome with software rendering).
- [ ] No CSP violations in the browser console, and the security headers are present (check with `curl -I`).
- [ ] `/data../` and `/data/../` return 404 or 400, not files from outside `current/`.
- [ ] `web` isn't reachable on the host's public IP, only through the proxy.
- [ ] The production MapTiler key is restricted to the production origin.
- [ ] `/debug.html` returns 404 in production (the debug map is dev only).

### Keeping fixtures honest

Tests use recorded data, so they keep passing even if a provider changes its format. Two things catch that:

- The production validation step refuses to publish bad output and logs why.
- When validation fails, or roughly every few months, refresh with `npm run update-data -- --record`, update the trimmed fixtures, and review the golden-file diff.

### Where tests run

- `npm test`: all tests. `npm run test:coverage`: with coverage thresholds. `npm run check`: type check and lint.
- **Docker build:** both Dockerfiles start from a shared `test` stage that runs `npm run check` and `npm run test:coverage`. A failing test blocks the image build, so nothing broken gets deployed. This needs no outside CI service.
- **Optional:** a GitHub Actions workflow running the same commands on pull requests, for earlier feedback. It isn't needed for deployment. If added, it triggers on `pull_request` (never `pull_request_target`), sets `permissions: contents: read`, and pins third-party actions by commit SHA.

## Phases

### Phase 0: reconnaissance and fixtures

Goal: confirm assumptions with as few requests as possible, and record a local cache so later phases need no provider traffic.

- Build `http.ts` first (rate limit, cache, UA, record/offline modes).
- Run one recording crawl: Geofabrik index, OSM-FR `extracts/`, `polygons/` and `replication/` listings, and all `.poly` files. Skip `.pbf` HEADs except a handful to confirm `Content-Length` behaviour.
- Verify these assumptions and update this plan where they're wrong:
  - [x] Geofabrik public extracts all provide daily updates, and `urls.updates` is present for every extract. *All 554 have `urls.updates`; daily confirmed from the technical page, not from `state.txt` (disallowed).*
  - [x] ~~HEAD on a Geofabrik `-latest.osm.pbf` returns `Content-Length`.~~ *Not tested: robots.txt disallows `*.osm.pbf`. Sizes come from region pages instead (checked on `canada.html`).*
  - [x] OSM-FR `extracts/<path>` maps cleanly to `polygons/<path>.poly` and `replication/<path>/<interval>/`. *Yes: all 1,196 regular extracts have a `.poly` and a `replication/<path>/minute/`; no polygon lacks an extract.*
  - [x] OSM-FR listings show exact byte sizes. *No: rounded (`311M`, `8G`). Acceptable for an estimate; HEAD is not an option given robots.txt.*
  - [x] Whether pre-merged OSM-FR extracts can be detected from structure or naming. *Yes: all 4 sit under `extracts/merge/` (`fiji`, `france_metro_dom_com_nc`, `france_taaf`, `kiribati`), so they are excluded by path and `osmfr-exclude.json` isn't needed for now.*
  - [x] OSM-FR's default interval is minutely. *Yes: every extract has `minute/`, and none has `hour/` or `day/`.*
  - [x] How many OSM-FR extracts have no change files, or lack minutely ones. *None. So for now the `differs` and `none` badges would never appear for OSM-FR; keep the logic for future changes.*
- Commit a small trimmed set of fixtures under `fixtures/` for unit tests. The full cache stays gitignored.

**Exit:** the full cache is recorded locally; the assumptions above are confirmed or the plan is updated.

#### Phase 0 findings (2026-11-06)

**OSM-FR robots.txt** is `User-agent: *` / `Disallow: /`, and its `llms.txt` says "YOUR ARE NOT WELCOME HERE". The project owner chose to crawl anyway with parameters matching manual exploration (see the politeness decision). The recording crawl (`updater/explore/osmfr-crawl.ts`) made 2,653 requests at 2s spacing over about 1.5 hours, received 7.7 MB, and got no errors, retries or non-200 responses. It skipped `replication/{bbox,planet,merge}/` and never entered `minute/` directories, apart from 2 sample listings that confirmed `state.txt` is there.

**OSM-FR structure:**

- 1,200 extracts: 1,196 regular and 4 under `merge/`. Depth counts (regular): 8 at depth 0, 200 at 1, 645 at 2, 343 at 3. That's twice as many as Geofabrik and finer-grained (e.g. 17 Quebec regions).
- Listings are nginx autoindex with no `ETag` or `Last-Modified`, so conditional requests don't help; every run is a full GET per directory. There are 112 directories under each of `extracts/` and `polygons/`, and about 1,200 under `replication/` (one per extract).
- `.poly` files do send `ETag` and `Last-Modified`, so conditional GETs work for them. Together they come to 6.4 MB.
- Each extract appears as `<name>.osm.pbf` and `<name>-latest.osm.pbf` (always the same size), plus `.osm.pbf.md5` and `.state.txt`. Dedupe on `<name>.osm.pbf`.
- Sizes are rounded (`311M`, `8G`).
- Names are directory names with underscores (`burkina_faso`, `nord_du_quebec`), unlike Geofabrik's hyphens. Display names have to be derived from them (phase 1).
- Two directories have no extract of their own: `africa/spain/` (Canarias, Ceuta, Melilla) and `europe/seas/` (`ionian_sea`, `north_sea`). Their children take the nearest ancestor that has an extract as their parent (here, `africa` and `europe`).
- `replication/south-america/brazil/brazil/…` has 27 interval directories with no matching extract, apparently leftovers. They are ignored.
- Every continent directory in `replication/` also has its own `minute/`.

**`.poly` edge cases seen in real files:** holes are common (e.g. `quebec.poly` has 2 outer rings and 8 holes); 184 files have several outer rings (up to 17); 44 use scientific notation; no longitude goes past ±180, since regions that cross the antimeridian (e.g. `chukotka_autonomous_okrug`, `oceania/tuvalu`) are split at ±180 instead. The first line is free text (`toto`, `polygon`, or a name), so it is ignored.

**Geofabrik robots.txt** disallows `*.osm.pbf`, `*.osm.bz2`, `*.osc.gz`, `*.shp.zip`, `state.txt`, `*.state.txt`, `*updates*` and `*.md5`. `index-v1.json` and the `.html` pages are allowed.

**Geofabrik index (`index-v1.json`)**, 3.8 MB, with `ETag` and `Last-Modified`:

- 554 extracts, all `MultiPolygon`, 146,050 vertices in total (largest 2,016). Every `parent` resolves; ids are unique short slugs (`canada`, `act`), not paths.
- Depth counts: 9 at depth 0, 266 at 1, 207 at 2, 72 at 3. Leaves: 1 at depth 0 (`antarctica`), 249 at 1, 201 at 2, 72 at 3.
- Top level: the 7 continents plus `russia` (with 10 federal-district children) and `antarctica` (a leaf).
- Every `urls.pbf` ends in `-latest.osm.pbf`, so the page URL can be derived. The URLs we use (`pbf`, `updates`) are all on `download.geofabrik.de`; `pbf-internal` and `history` are on `osm-internal.download.geofabrik.de` and `taginfo` on `taginfo.geofabrik.de`, and none of those are used.
- Region pages list each child with `(335&nbsp;MB)`-style sizes. 31 extracts have children.

Requests made in phase 0: 4 to Geofabrik (robots.txt, `index-v1.json`, `canada.html`, `technical.html`) and about 2,660 to OSM-FR (the crawl plus the first 6 manual ones). Fixtures, written by `updater/explore/trim-fixtures.ts` from the cache: `fixtures/geofabrik/` (10 features from `index-v1.json` covering continents, `russia`, `antarctica` and Canadian provinces, plus `canada.html`) and `fixtures/osmfr/` (13 listings and 6 `.poly` files chosen for the edge cases above).

### Phase 1: updater core

- `shared/schema.ts`, the `.poly` parser, the listing parser, both providers, levels, validation and release writing.
- Test setup (vitest projects, network guard, coverage thresholds) goes in first, and tests are written alongside each module (see [Testing](#testing)).
- `npm run update-data -- --offline` produces a complete release directory from the cache.

**Exit:** valid `meta.json`, `extracts.json` and per-provider GeoJSON files build offline; 100% updater coverage; every case in the updater failure-case list has a test; golden files committed.

#### Phase 1 results (2026-11-06)

Done. `npm run update-data -- --offline --providers geofabrik,osmfr` builds a full release from the recorded cache in about 1.5s with no requests: 554 Geofabrik and 1,196 OSM-FR extracts. 330 tests, 100% coverage of `updater/` and `shared/`.

| File | Raw | Gzipped |
| --- | --- | --- |
| `boundaries-geofabrik.geojson` | 3.0 MB | 1.1 MB |
| `boundaries-osmfr.geojson` | 6.7 MB | 1.7 MB |
| `extracts.json` | 1.1 MB | — |

- One request to Geofabrik: `index.html`, to check its size format (same as region pages). Only `canada.html` and `index.html` are cached, so an offline build has sizes for just 21 Geofabrik extracts. The other region pages are fetched by the first online Geofabrik run (done after phase 3, see below).
- No requests to OSM-FR. An offline OSM-FR build reads 2,617 cached responses, which is also the request count for a first online run.
- The pipeline test builds from `fixtures/pipeline/`, a small self-consistent subset written by `updater/explore/trim-fixtures.ts`. Its responses are real, with listing rows outside the subset removed. Run `npx vitest run updater/pipeline.test.ts -u` to update the golden files after an intended change, then review the diff.
- `sizeCheckedAt` and each provider's `fetchedAt` come from when the response was recorded, so an offline build reports the cache's age, not the build time.

### Phase 2: level and data exploration

Goal: decide whether raw depth works as a level, and see how heavy the GeoJSON is.

- `updater/explore/levels-report.ts` outputs:
  - extract counts per depth per provider;
  - leaf depth distribution per provider;
  - side-by-side trees for sample areas: Canada (BC vs. Quebec sub-regions), France, the USA, Germany, Russia, and a few small countries;
  - top-level entries that aren't continents.
- A bare debug map page (the Vite app with no UI) that renders both providers at each depth, to look over by eye.
- Record file sizes per provider (raw and gzipped) and feature/vertex counts.
- Decide:
  - whether raw depth is good enough, or what goes in `level-overrides.json`;
  - the final level labels and how many levels to offer;
  - whether a compare view is needed (if both providers mostly line up conceptually at the same depth, showing both layers together is enough).

**Exit:** the level rules are written into this plan; the override list is in place; GeoJSON sizes are known.

#### Phase 2 results (2026-11-06)

Done. `node updater/explore/levels-report.ts [releaseDir] [outFile]` writes the report; the current output is [levels-report.md](levels-report.md). `npm run dev` serves the debug map at `http://localhost:5173/debug.html` (provider toggles, each depth or "smallest available", the coarser fallback dashed, bundles on request, hover details, load timing). It uses the MapTiler key from `web/public/config.json` (gitignored) if there is one, otherwise MapLibre's keyless demo style.

Findings:

- **Depth lines up across providers.** Canadian provinces, US states, German Länder, French regions and Russian federal districts are all at depth 2 in both providers (after the fixes below). Depth 3 is sub-regions: Quebec regions, French départements, Regierungsbezirke, Russian oblasts (OSM-FR), US counties and state regions (OSM-FR).
- **Russia** is top level in both providers, beside the continents. Moved to depth 1 by override; the Europe and Asia outlines cover it, so the continent view has no gap.
- **Geofabrik's US states** sat under `north-america` beside `us` and drew on top of it. Fixed structurally in the provider (see the Geofabrik section), which also fixed their names. `us` is now a parent, and `us.html` becomes one of the size pages (32 in all).
- **Bundles:** an overlap check (leaves containing other leaves of the same provider) found Geofabrik's combined extracts drawing over their parts in the leaf and country views. They are flagged and left out (see Levels). The remaining overlaps are enclaves, such as Berlin in Brandenburg or Vatican City in Lazio, which are real separate extracts and stay.
- **OSM-FR's US** has no single country extract; at country level it shows the four US regions (Midwest, Northeast, South, West), which is the coarsest it offers.
- **Compare view: not needed.** Both providers mostly mean the same thing at the same depth, and both layers together were readable enough on the debug map. Removed from phase 6.
- **Reviewed on the debug map:** the overlaps left in "smallest available" look like provider choices (enclaves and similar), not missed bundles. Load performance is good.

Counts after the fixes (bundles excluded; "all / leaves"):

| Provider | Depth 0 | Depth 1 | Depth 2 | Depth 3 | Bundles |
| --- | --- | --- | --- | --- | --- |
| Geofabrik | 8 / 1 | 194 / 176 | 268 / 261 | 74 / 74 | 10 |
| OSM-FR | 7 / 0 | 197 / 156 | 564 / 504 | 426 / 426 | 2 |

Boundary sizes (full detail, unchanged from phase 1): Geofabrik 2.9 MB raw / 1.1 MB gzipped, 554 features, 146,050 vertices; OSM-FR 6.3 MB / 1.6 MB, 1,196 features, 416,182 vertices; largest single feature about 2,400 vertices. About 2.7 MB gzipped for both providers is likely fine; the phase 3 performance check decides.

Other changes: `SCHEMA_VERSION` is now 2 (the `isBundle` field), so a version 1 release isn't carried over; rebuild with `npm run update-data -- --offline --providers geofabrik,osmfr`. The pipeline fixtures now include OSM-FR's `russia` → Northwestern Federal District → Kaliningrad Oblast to cover the depth override. The web libraries are devDependencies, since Vite bundles them and the updater image installs with `--omit=dev`.

### Phase 3: frontend MVP

- Map, provider toggle, level selector with coarser-fallback styling, hover, click selection with the overlap picker, selection panel with totals, badges, copy buttons, provider links, attribution and last-updated footer (moved into the header after review).
- **GeoJSON performance check** on desktop and a mid-range phone (or Chrome CPU throttling): time to first render, pan/zoom smoothness with both providers at leaf level, and memory use. If it's acceptable, keep GeoJSON. If not, try simplifying first (mapshaper at a light tolerance), and consider PMTiles only after that.

- Logic modules and component tests, including the accessibility tests, written alongside the features.

**Exit:** all core features work locally against offline data and have tests; the performance decision is recorded.

#### Phase 3 results (2026-11-06)

Done. `npm run dev` serves the app at `http://localhost:5173/` against `data/current`; `npm run build` then `npm run preview` serves the production build the same way. 534 tests after the review rounds (182 of them frontend), updater and shared code still at 100% coverage (frontend coverage isn't enforced; it was about 99% of lines before review). `npm run check` runs both type checks and oxlint.

What's in:

- Map with both providers, level selector (with the coarser fallback dashed and fainter, and a legend), provider toggle, hover tooltip and highlight, click to select, and the overlap picker when a click hits several extracts.
- Selection panel: total and per-provider estimated sizes (extracts with no known size are counted separately), replication badges, provider page link, and copy buttons for the `.pbf` and replication URLs (the `.poly` button was dropped after review). Links and copied URLs both go through `safeHref()`.
- Search (ignores case, accents and punctuation) and an extract list sortable by name or size. Hovering or focusing a row highlights its polygon; activating it selects it and zooms to it.
- Each provider's `fetchedAt`, stale and missing-provider notices, and a GitHub link, all in the header (first built as a footer, moved up after review because the list pushed it out of sight). The about link is left for the phase 5 about modal.
- Map controls: zoom buttons and a location button (MapLibre's geolocate control; the position stays in the browser). The hover tooltip measures itself and stays inside the map, and hides while the map pans or zooms, since a touch screen has no cursor to move away afterwards.
- Below 768px the map takes the top 40% of the screen and stays there while the sidebar scrolls below it. The bottom sheet is still phase 5.
- Coverage gaps: land with no extract drawn for the shown providers and level is hatched, with a legend entry (see Coverage gaps in the updater pipeline). Added after review. After pulling, rebuild local data with `npm run update-data -- --offline --providers geofabrik,osmfr` to get `gaps.geojson`.
- Smaller fixes from review: the selected provider segment's right border shows and no longer draws above the map on phones; a "Legend" label above the line styles; a copy icon on the copy buttons; provider, size and update details aligned on one baseline; the empty selection reads "Click an area on the map or list below."; dates read "last checked" rather than "last updated".

Decisions and findings:

- **Performance: keep full-detail GeoJSON.** Measured with headless Chrome on the production build. It renders with SwiftShader (on the CPU), so these figures are a pessimistic stand-in for a real GPU. Data (9.7 MB raw) arrives in about 0.15 s locally. Map `load` comes about 0.5 s after a basemap-only run at normal speed, and about 0.8 s after it at 4× CPU throttling (a stand-in for a mid-range phone; the basemap alone takes 3.4 to 3.8 s in this renderer). Zooming ran at 47 fps (37 fps throttled), against 90 fps (78) for the basemap alone. Hover stays at full frame rate. JS heap 56 to 111 MB. A check on a real phone is still in the release checklist.
- **MapLibre's worker in production builds:** MapLibre 6 loads its worker from a file next to its own module, which a Vite build leaves behind, so the built app failed with "Worker failed to load". `web/src/maplibre-worker.ts` imports the worker file with `?url` (Vite copies it into `assets/` with a hash) and calls `setWorkerUrl()`. The CSP needs `worker-src 'self'` (see Deployment).
- **Lint: oxlint instead of ESLint.** `typescript-eslint` needs TypeScript below 6.1, and this project uses TypeScript 7, which has no JS API. oxlint parses TypeScript itself and has jsx-a11y and React hooks rules; `.oxlintrc.json` turns on the jsx-a11y recommended set. `prefer-tag-over-role` and `control-has-associated-label` are off: the first would swap `role="status"`/`role="dialog"` for elements with different behaviour, and the second can't see text inside child components (the axe tests check names instead).
- **axe without `vitest-axe`:** that package hasn't changed since early 2025, so the tests call `axe-core` directly. Colour contrast is checked by `web/src/lib/contrast.test.ts` against the tokens in `styles.css` and the basemap's land and water colours. OSM-FR's line colour was darkened from `#d55e00` to `#b84a00` to clear 3:1 against water.
- **No map labels from our data, but parent regions in the list.** The extract list and selection panel show each extract's parent regions, since there's no map around them to tell apart similar names. The overlap picker doesn't: it opens on the map, where the context is visible.
- **Geofabrik sizes:** the offline builds used until now had sizes for only 21 of 554 Geofabrik extracts (3.8%), because the cache held just `index.html` and `canada.html`; the app showed "Size unknown" for the rest (reported for Iowa). The size code itself was fine. One online run (`npm run update-data -- --record --providers geofabrik`, 2026-11-07) made 34 requests at the 1 s pacing (index, 32 size pages, one not modified) and now gives sizes for all 554 extracts, including `russia` and the US states from `us.html`. OSM-FR was already at 1,196 of 1,196. The pages are cached, so later offline builds keep the sizes.
- **Shared level rule:** `levelClass()` moved to `shared/levels.ts` so the updater's coverage gaps and the map agree on what each level draws. The MapLibre filter version stays in `web/src/lib/levels.ts`.
- **Build size warning:** the bundle is about 1.4 MB minified (380 KB gzipped), almost all of it MapLibre, so `chunkSizeWarningLimit` is 1500 KB.
- New dev dependencies were pinned to releases at least two weeks old. `polyclip-ts` 0.16.8 (December 2024) is the one new runtime dependency, for the updater.

### Phase 4: deployment

- Dockerfiles (with the shared `test` stage, pinned base images, checksum-verified supercronic and a non-root updater), nginx config (with the security headers and CSP), entrypoint, compose (with `expose` and the separate cache volume), first-run behaviour and the manual update command.
- Restrict the MapTiler keys by origin.
- Keep the phase 2 debug map (`web/debug.html`, `web/src/debug/`) out of production. `vite build` currently builds only `index.html`, so `web/dist/` has no debug page; keep it that way (don't add `debug.html` to the build inputs or copy it into the image), and check it in the release checklist.
- Run the release checklist before the first deploy.
- One full Geofabrik run (including the size pages) from a local `docker compose up`, checking the request log for request counts and pacing. (A local `npm run update-data -- --record --providers geofabrik` already ran once, see the phase 3 results; this repeats it in the container.) Then one manual OSM-FR run in production, since the production cache volume starts empty.
- Deploy to Coolify as a standard compose project.

**Exit:** the production site is live, the scheduled update runs, and the manual update works.

### Phase 5: polish

- Mobile bottom sheet, accessibility pass (keyboard, screen reader labels, contrast; extends the automated tests with a manual screen reader run), about modal (what this is, what "coarser" means, the replication badges, data sources, refresh schedule: Geofabrik weekly, OSM-FR occasionally), empty/error states (data failed to load, stale provider), favicon and meta tags.

### Phase 6: optional features (decide individually)

- **"What covers this point?"** Click or geocode a location to list every extract containing it, from both providers and across all depths, sorted by size. It uses `queryRenderedFeatures` or a client-side point-in-polygon test over all features.
- **Bundles and pre-merged OSM-FR extracts:** decide whether to show them, perhaps as a separate toggle outside the level hierarchy. Geofabrik and OSM-FR bundles are already in the data (`isBundle`); OSM-FR's `merge/` isn't fetched.
- **PMTiles**, only if phase 3 shows a performance problem that simplification doesn't fix.

## Open items to resolve during implementation

- **OSM-FR access:** due to robots.txt, the owner chose to limit requests to those matching manual exploration (2026-11-06). No automatic updating of OSM-FR is planned without permission.
- ~~Geofabrik `index.html` size format for top-level extracts (phase 1).~~ *Same format as region pages.*
- ~~Which Geofabrik page lists `russia`'s size (it isn't on `index.html`); check after the first online run.~~ *Both `europe.html` and `asia.html` list it (checked 2026-11-07).*
- ~~Final level labels and override list (phase 2).~~ *See Levels and the phase 2 results.*
- ~~Confirm OSM-FR's default replication interval.~~ *Minutely (phase 0). Geofabrik's is daily.*
- Whether to show merged extracts (phase 6).
- ~~How to derive OSM-FR display names from directory names (phase 1).~~ *See the OSM-FR section.*
