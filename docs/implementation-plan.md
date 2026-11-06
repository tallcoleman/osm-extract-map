# Extracts Map: Implementation Plan

This plan builds on [design.md](design.md) and the decisions made during design review. Phases are ordered so that the two biggest unknowns (how depth levels behave across providers, and whether full-detail GeoJSON performs well enough) are tested early, before UI polish and deployment.

## Decisions carried forward

| Topic | Decision |
| --- | --- |
| Level filter | Levels are derived from tree depth. The default view is "smallest available" (leaf extracts). When a branch has no extract at the selected depth, the deepest available ancestor-level leaf is shown with a distinct "coarser" style. Depth logic is validated in an exploration phase and may get manual overrides. |
| Download sizes | Geofabrik: HEAD request per `.osm.pbf` (`Content-Length`). OSM-FR: sizes parsed from nginx directory listings. |
| Overlap in size totals | Not specially handled, since only one depth level is shown at a time. |
| Geometry format | Full-detail GeoJSON first. PMTiles only if performance testing shows a problem. |
| Change file frequency | Each provider has an expected default interval (OSM-FR: minutely, Geofabrik: daily, both to be confirmed in phase 0). Extracts are flagged only when they differ from their provider's default or have no change files at all. |
| URLs | Provider pages are the primary link. Key URLs (page, `.pbf`, `.poly`, replication base) are shown with copy buttons. The site helps people explore what providers offer; it does not replace their download pages. |
| OSM-FR scope | Everything in `extracts/`, matched with `polygons/` and `replication/`. Pre-merged extracts are excluded via a manual list unless they can be detected from structure. Whether to show them is revisited at the end. |
| Data schema | Provider-agnostic, so other providers can be added later. |
| URL state | Not needed. |
| Deployment | Two containers (static web server + updater) with a shared volume. No Coolify-specific features. |
| Politeness | Rate-limited, conditional requests, request cache, recorded fixtures for development. User-Agent points to the public GitHub repo URL, never a personal email. |
| Deferred features | "What covers this point?" lookup, cross-provider compare view, pre-merged OSM-FR extracts, PMTiles. |

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
│        ┌──────────────── data volume ──────────┘                   │
│        │  releases/<timestamp>/…                                    │
│        │  current → releases/<timestamp>   (atomic symlink swap)   │
│        │  cache/  (HTTP cache: bodies + ETag/Last-Modified)        │
│        └───────────────────────────────────────────                │
└────────────────────────────────────────────────────────────────────┘
```

- The app is built once into the `web` image. Data updates never require a rebuild or redeploy.
- The browser loads the app shell, then fetches `/data/current/meta.json` and the data files it references.

## Repository layout

```
/
├── docs/
│   ├── design.md
│   └── implementation-plan.md
├── package.json              # single package, npm
├── tsconfig.json
├── shared/
│   └── schema.ts             # Extract types, shared by web + updater
├── updater/
│   ├── cli.ts                # thin entry point: parses args, calls runUpdate()
│   ├── run.ts                # runUpdate(): full pipeline, dependencies passed in
│   ├── http.ts               # rate-limited, caching, conditional HTTP client
│   ├── providers/
│   │   ├── geofabrik.ts
│   │   └── osmfr.ts
│   ├── poly.ts               # .poly → GeoJSON
│   ├── listing.ts            # nginx autoindex HTML parser
│   ├── levels.ts             # depth computation + overrides
│   ├── validate.ts
│   ├── release.ts            # write release dir, swap symlink, prune
│   ├── explore/              # one-off exploration scripts (phase 2)
│   └── config/
│       ├── osmfr-exclude.json     # pre-merged extracts etc.
│       └── level-overrides.json   # manual depth fixes, if needed
├── web/
│   ├── index.html
│   ├── src/…                 # React + TS + react-map-gl/maplibre
│   └── public/
├── fixtures/                 # small committed fixtures for unit tests
│   └── expected/             # golden output files for the pipeline test
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
  providers: Record<ProviderId, {
    extractCount: number;
    fetchedAt: string;
    status: "ok" | "stale";   // "stale" = reused previous data after a fetch failure
  }>;
  files: {
    extracts: string;                       // e.g. "extracts.json"
    boundaries: Record<ProviderId, string>; // e.g. "boundaries-geofabrik.geojson"
  };
}
```

Output files in each release directory:

- `meta.json`: small, fetched first.
- `extracts.json`: all `Extract` records, no geometry. Drives the sidebar, search, selection and totals.
- `boundaries-<provider>.geojson`: one FeatureCollection per provider. Each feature has `key`, `depth`, `isLeaf` and `name` as properties (enough for map styling and filtering), plus the geometry.

Splitting by provider keeps each file smaller and lets the browser load providers in parallel.

## Updater pipeline

### HTTP client (`updater/http.ts`)

All network access goes through one client:

- **Rate limit:** one request at a time with a minimum gap between requests (default 1s, configurable via `REQUEST_INTERVAL_MS`).
- **User-Agent:** `osm-extract-map/<version> (+https://github.com/tallcoleman/osm-extract-map)`.
- **Conditional requests:** stores `ETag`/`Last-Modified` per URL in `cache/` and sends `If-None-Match`/`If-Modified-Since`. A `304` returns the cached body.
- **HEAD support** for size checks, with responses cached the same way.
- **Retries:** limited retries with exponential backoff on 5xx/network errors. Honours `Retry-After` on 429/503. Never retries 4xx.
- **Modes:** `online` (default), `offline` (serve from cache only, fail on a miss; used in development) and `record` (online, and always write to the cache).
- **Logging:** request count and bytes per run, so the load on providers is visible.

### Geofabrik (`updater/providers/geofabrik.ts`)

1. Conditional GET of `https://download.geofabrik.de/index-v1.json`. One request; a `304` means the boundaries are unchanged.
2. Map each feature to an `Extract`. Fields: `id`, `parent`, `name`, `urls.pbf`, `urls.updates`. Geometry comes from the feature itself. The page URL is derived from the `.pbf` URL (`…-latest.osm.pbf` → `….html`).
3. Sizes: HEAD each `urls.pbf` and read `Content-Length`. There are roughly 500+ requests; at 1/s that's under 10 minutes. Sizes are refreshed on every scheduled run, since they change daily. Follow redirects if HEAD returns one.
4. Replication: `available = !!urls.updates`. The `updates` URL doesn't name an interval, so it is set from the provider's `expectedInterval` (daily). Phase 0 checks this by reading a sample of `state.txt` files.

### Replication status (both providers)

After each provider is mapped, set `replication.status` for every extract:

- `none`: no change files.
- `differs`: the provider's `expectedInterval` is not among `intervals` (e.g. an OSM-FR extract with only hourly or daily diffs).
- `expected`: otherwise. An extract that offers the expected interval plus others still counts as expected.

### OSM-FR (`updater/providers/osmfr.ts`)

1. Crawl the `extracts/` tree via nginx autoindex listings, one GET per directory with conditional requests. Collect `*.osm.pbf` entries (name, size, mtime).
2. Crawl `replication/` the same way and record which extract paths have `minute/`, `hour/` and `day/` subdirectories containing `state.txt`.
3. For each extract, derive the matching `polygons/<path>.poly` URL. Fetch it only if its `Last-Modified` (from the `polygons/` listing) is newer than the cached copy.
4. Apply `config/osmfr-exclude.json`. During phase 0, check whether pre-merged extracts can be detected from naming or structure instead.
5. Parent/child relationships come from the directory structure.
6. Report extracts that have no polygon file and polygons that have no extract. Log them rather than failing.

### `.poly` parser (`updater/poly.ts`)

- Format: a first line with the file name, then sections. Each section is a name line, `lon lat` coordinate lines, and `END`. A final `END` closes the file.
- Sections whose name starts with `!` are holes. Assign each hole to the outer ring that contains it (point-in-polygon on the hole's first vertex).
- Output is a GeoJSON `Polygon` or `MultiPolygon` with rings closed and wound per RFC 7946.
- Edge cases to test: multiple outer sections, holes, scientific notation, longitudes beyond ±180 (antimeridian-crossing regions such as Russia, Fiji and Alaska).
- Unit tests use small committed fixtures.

### Levels (`updater/levels.ts`)

- `depth` = number of ancestors (top-level entries are depth 0).
- `isLeaf` = has no children within the same provider.
- `config/level-overrides.json` maps `key → depth` for cases where raw depth gives a poor result (e.g. Geofabrik has `russia` at the top level alongside continents). This is expected to be a short list; phase 2 decides what goes in it.

### Validation (`updater/validate.ts`)

The new release is published only if all of these pass:

- Each provider's extract count is above 0 and hasn't dropped more than 10% from the previous release.
- Every extract has a geometry, and each geometry is parseable with a non-empty bounding box.
- Every `parentKey` resolves to an existing extract.
- `meta.json` matches the schema version.

If one provider fails to fetch, reuse its data from the previous release and mark it `status: "stale"` in `meta.json`. If validation fails, keep the current release, log the reason and exit non-zero.

### Release (`updater/release.ts`)

1. Write all files to `releases/<timestamp>/`.
2. Point a temporary symlink at it, then `rename()` it over `current`. The rename is atomic, so nginx never serves a half-written release.
3. Prune old releases, keeping the last 3.

### Running the updater

- `npm run update-data`: full run, online.
- `npm run update-data -- --offline`: build from the cache only (development).
- `npm run update-data -- --record`: refresh the local cache from the providers (used rarely, to refresh fixtures).
- `npm run update-data -- --skip-sizes`: skip the HEAD pass (faster during development).

## Frontend

### Stack

Vite + React + TypeScript + `react-map-gl/maplibre`. No state library; React state plus context is enough for this size.

### Runtime config

At container start, `web-entrypoint.sh` writes `config.json` (`{ "maptilerKey": "…" }`) from the `MAPTILER_KEY` env var. The app fetches it on load. The key can then change without rebuilding the image. In development, Vite serves a local `config.json` that is gitignored.

### Map layers

For each provider: a GeoJSON source, a line layer, a fill layer for hover/selection, and a line layer for the selected outline.

- **Provider colours:** two colourblind-safe hues, also told apart by line pattern (e.g. solid vs. slightly offset with `line-offset`), so overlapping outlines stay legible when both providers are shown.
- **Fills:** none by default (so overlap doesn't get muddy), a faint fill on hover and a stronger fill when selected.
- **Level filter** (applied with a MapLibre `filter` expression on `depth`/`isLeaf`, with no data reload):
  - Level *d* shows features where `depth == d`, plus features where `depth < d && isLeaf` in the **coarser** style (dashed line, lower opacity). This is the fallback for branches with no extract at depth *d*.
  - "Smallest available" (the default) shows every leaf, in the normal style.
- **Labels:** extract names at a sensible zoom, using symbol placement on polygon centroids. Decide in phase 3 whether these help or add clutter.

### Controls (sidebar on desktop, bottom sheet on mobile)

- **Header:** site name, one-line explanation, and prominent links to https://www.geofabrik.de/ and https://www.openstreetmap.fr/.
- **Provider toggle:** Geofabrik / OSM-FR / Both (default Both).
- **Level selector:** Smallest available (default) / Continent / Country / Region / Sub-region. The labels map to depth 0–3; phase 2 may adjust them. A legend explains the coarser style.
- **Search box:** filters the visible extracts by name.
- **Extract list:** visible extracts sorted by name or size. This is the keyboard-accessible alternative to clicking on the map. Hovering a row highlights the polygon; clicking zooms to it and toggles selection.
- **Selection panel:**
  - Selected extracts, each with provider, size, replication badge, a link to the provider page, and copy buttons for `.pbf`, `.poly` and the replication base URL.
  - Total estimated download size, broken down by provider.
  - A "Clear" button.
- **Footer:** last updated time from `meta.json`, a stale-data notice if any provider is `stale`, an about/attribution link, and a GitHub link.

### Map interaction

- Click a polygon to toggle selection. If several features are under the cursor (common when both providers are shown), show a small popup listing them so the user can choose.
- Hover shows a tooltip with name, provider and size.
- Replication badges are based on `replication.status`:
  - `none`: warning badge, "No change files".
  - `differs`: notice badge naming the interval, e.g. "Hourly updates only (OSM-FR default is minutely)".
  - `expected`: no badge. The interval appears as a plain detail in the selection panel.
- The about modal and legend state each provider's default interval, so a missing badge clearly means "normal for this provider".

### Attribution

MapLibre's attribution control collects the `attribution` strings from every loaded source. The MapTiler basemap style already brings its own (typically "© MapTiler © OpenStreetMap contributors"). So attribution starts with a check, and only what's missing gets added:

1. In phase 3, load the chosen basemap style and record what attribution it shows by default.
2. Add anything still needed as the `attribution` property on our own GeoJSON sources, not as separate page text. It then appears in the same control, and only while that provider's layer is loaded. Expected additions: boundary credit for Geofabrik and OpenStreetMap France, linking to their sites.
3. Don't duplicate credits the basemap already shows (e.g. "© OpenStreetMap contributors").
4. The about modal can explain the data sources in more detail, but the map's attribution control is the source of truth.

### Accessibility and mobile

- All map actions can also be done from the extract list.
- Controls are keyboard-navigable with visible focus, and badges have text labels (not colour alone).
- Below roughly 768px, the sidebar becomes a draggable bottom sheet with collapsed, half and full positions.
- Tap targets are at least 44px.

## Deployment

### `web` container

- Multi-stage Dockerfile: a Node stage installs with `npm ci` and builds the Vite app, then copies `dist/` into `nginx:alpine`.
- nginx config:
  - The data volume is mounted read-only. `/data/` serves `current/` from it.
  - Hashed app assets: `Cache-Control: public, max-age=31536000, immutable`.
  - `index.html`, `config.json` and `/data/*`: `Cache-Control: no-cache` (revalidate with ETag).
  - `gzip on` for `application/json`, `application/geo+json` and JS/CSS. GeoJSON compresses very well.
  - Map `.geojson` to `application/geo+json`.

### `updater` container

- `node:22-alpine` plus `supercronic`, with dependencies installed via `npm ci`.
- `CRON_SCHEDULE` env var (default weekly, e.g. `0 3 * * 1`).
- On start: if `current` doesn't exist, run once immediately so a fresh deploy isn't empty.
- The data volume is mounted read-write.

### Manual update

`docker compose exec updater npm run update-data`. This is plain Docker; any host, including Coolify's terminal, can run it.

### `compose.yaml`

- Two services and one named volume (`data`).
- `web` exposes port 80 only. TLS and the domain are handled by whatever reverse proxy sits in front (Coolify's proxy in production).
- Env vars: `MAPTILER_KEY` (web); `CRON_SCHEDULE` and `REQUEST_INTERVAL_MS` (updater).

## Testing

### Approach

| Area | Target | Tools |
| --- | --- | --- |
| Updater and shared code (`updater/`, `shared/`) | 100% line, branch and function coverage, enforced in CI and the Docker build | vitest, `@vitest/coverage-v8`, undici `MockAgent` |
| Frontend logic and components (`web/src/`) | Good coverage of key features and accessibility; no hard threshold | vitest (jsdom), React Testing Library, `@testing-library/user-event`, `vitest-axe` |
| End-to-end / browser | None. Replaced by a short manual release checklist | — |
| Static checks | Type check and lint must pass | `tsc --noEmit`, ESLint with `eslint-plugin-jsx-a11y` |

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
  - HEAD with redirects; a missing `Content-Length` gives `sizeBytes: null`.
- **`.poly` parser:**
  - committed real-world fixtures;
  - multiple outer rings, holes assigned to the correct outer ring, scientific notation, longitudes beyond ±180, ring closing and winding order;
  - malformed input (missing `END`, non-numeric coordinates, empty file) gives a clear error.
  - A property-based round-trip test (`fast-check`): generate a polygon, write it as `.poly`, parse it, and compare.
- **Listing parser:** recorded nginx autoindex HTML; files vs. directories; sizes and dates; unexpected HTML gives a clear error, never a silently empty result.
- **Providers:**
  - mapping from fixture data to `Extract` records, including derived page and `.poly` URLs;
  - exclude list applied; parent/child links;
  - extracts without polygons, and polygons without extracts, are logged and not fatal;
  - replication intervals detected from listings.
- **Replication status:** table-driven tests for `expected` / `differs` / `none`, including "expected interval plus others".
- **Levels:** depth and leaf computation; overrides applied; an override pointing to a missing key is an error.
- **Validation:** each rule passes and fails on its own; one provider failing reuses the previous data marked `stale`; both failing keeps the current release.
- **Release:** runs against a real temporary directory. Covers writing, the atomic symlink swap, pruning to 3 releases, and a failure mid-write leaving `current` untouched.
- **Pipeline:** `runUpdate()` in offline mode over the committed fixture subset produces output that matches committed golden files (`fixtures/expected/`). Output changes then show up as a reviewable diff.

### Frontend

MapLibre needs WebGL, which jsdom doesn't have. So map behaviour is split into two parts:

- **Pure logic modules (`web/src/lib/`), where most frontend tests go:**
  - building the level filter expression (including the coarser fallback) and provider filters;
  - the selection reducer, size totals and size formatting;
  - badge text from `replication.status`;
  - search and sorting;
  - the list of candidates for the overlap picker;
  - loading data/config, including error and stale states.
- **The map component:** `react-map-gl` is mocked. Tests check that the right sources, layers, filters and event handlers are passed in, and that a mocked click with several features opens the overlap picker. Real rendering is checked by hand (see the checklist below).

Component tests (React Testing Library + user-event) cover the provider toggle, level selector, search, extract list, selection panel, copy buttons (clipboard mocked), about modal, bottom sheet, and the error/stale notices.

Accessibility tests:

- `vitest-axe` checks on each major component in its main states (empty, with selection, with warnings, error).
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
- [ ] Performance is still acceptable with both providers at leaf level.

### Keeping fixtures honest

Tests use recorded data, so they keep passing even if a provider changes its format. Two things catch that:

- The production validation step refuses to publish bad output and logs why.
- When validation fails, or roughly every few months, refresh with `npm run update-data -- --record`, update the trimmed fixtures, and review the golden-file diff.

### Where tests run

- `npm test`: all tests. `npm run test:coverage`: with coverage thresholds. `npm run check`: type check and lint.
- **Docker build:** both Dockerfiles start from a shared `test` stage that runs `npm run check` and `npm run test:coverage`. A failing test blocks the image build, so nothing broken gets deployed. This needs no outside CI service.
- **Optional:** a GitHub Actions workflow running the same commands on pull requests, for earlier feedback. It isn't needed for deployment.

## Phases

### Phase 0: reconnaissance and fixtures

Goal: confirm assumptions with as few requests as possible, and record a local cache so later phases need no provider traffic.

- Build `http.ts` first (rate limit, cache, UA, record/offline modes).
- Run one recording crawl: Geofabrik index, OSM-FR `extracts/`, `polygons/` and `replication/` listings, and all `.poly` files. Skip `.pbf` HEADs except a handful to confirm `Content-Length` behaviour.
- Verify these assumptions and update this plan where they're wrong:
  - [ ] Geofabrik public extracts all provide daily updates, and `urls.updates` is present for every extract.
  - [ ] HEAD on a Geofabrik `-latest.osm.pbf` returns `Content-Length` directly or after a redirect.
  - [ ] OSM-FR `extracts/<path>` maps cleanly to `polygons/<path>.poly` and `replication/<path>/<interval>/`.
  - [ ] OSM-FR listings show exact byte sizes (not rounded like `12M`). If rounded, sizes are approximate, which is acceptable for an estimate. Otherwise fall back to HEAD.
  - [ ] Whether pre-merged OSM-FR extracts can be detected from structure or naming. If not, write the first version of `osmfr-exclude.json`.
  - [ ] OSM-FR's default interval is minutely (i.e. most extracts have a `minute/` replication directory).
  - [ ] How many OSM-FR extracts have no change files, or lack minutely ones.
- Commit a small trimmed set of fixtures under `fixtures/` for unit tests. The full cache stays gitignored.

**Exit:** the full cache is recorded locally; the assumptions above are confirmed or the plan is updated.

### Phase 1: updater core

- `shared/schema.ts`, the `.poly` parser, the listing parser, both providers, levels, validation and release writing.
- Test setup (vitest projects, network guard, coverage thresholds) goes in first, and tests are written alongside each module (see [Testing](#testing)).
- `npm run update-data -- --offline` produces a complete release directory from the cache.

**Exit:** valid `meta.json`, `extracts.json` and per-provider GeoJSON files build offline; 100% updater coverage; every case in the updater failure-case list has a test; golden files committed.

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

### Phase 3: frontend MVP

- Map, provider toggle, level selector with coarser-fallback styling, hover, click selection with the overlap picker, selection panel with totals, badges, copy buttons, provider links, attribution and last-updated footer.
- **GeoJSON performance check** on desktop and a mid-range phone (or Chrome CPU throttling): time to first render, pan/zoom smoothness with both providers at leaf level, and memory use. If it's acceptable, keep GeoJSON. If not, try simplifying first (mapshaper at a light tolerance), and consider PMTiles only after that.

- Logic modules and component tests, including the accessibility tests, written alongside the features.

**Exit:** all core features work locally against offline data and have tests; the performance decision is recorded.

### Phase 4: deployment

- Dockerfiles (with the shared `test` stage), nginx config, entrypoint, compose, supercronic, first-run behaviour and the manual update command.
- Run the release checklist before the first deploy.
- One full online run (including the size HEADs) from a local `docker compose up`, checking the request log for request counts and pacing.
- Deploy to Coolify as a standard compose project.

**Exit:** the production site is live, the scheduled update runs, and the manual update works.

### Phase 5: polish

- Mobile bottom sheet, accessibility pass (keyboard, screen reader labels, contrast; extends the automated tests with a manual screen reader run), about modal (what this is, what "coarser" means, the replication badges, data sources, refresh schedule), empty/error states (data failed to load, stale provider), favicon and meta tags.

### Phase 6: optional features (decide individually)

- **"What covers this point?"** Click or geocode a location to list every extract containing it, from both providers and across all depths, sorted by size. It uses `queryRenderedFeatures` or a client-side point-in-polygon test over all features.
- **Pre-merged OSM-FR extracts:** decide whether to show them, perhaps as a separate toggle outside the level hierarchy.
- **Cross-provider compare view**, if phase 2 shows it's needed.
- **PMTiles**, only if phase 3 shows a performance problem that simplification doesn't fix.

## Open items to resolve during implementation

- Final level labels and override list (phase 2).
- Confirm each provider's default replication interval (phase 0).
- Whether OSM-FR sizes come from listings or HEADs (phase 0).
- Exclude list contents (phase 0), and whether to show merged extracts (phase 6).
