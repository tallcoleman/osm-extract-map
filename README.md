# osm-extract-map
Simple and easy to use web map to show the bounds of extracts offered by Geofabrik and OSM-FR

## Data sources

- Extract boundaries, sizes and links: [Geofabrik](https://download.geofabrik.de/) and [OpenStreetMap France](https://download.openstreetmap.fr/), from OpenStreetMap data © OpenStreetMap contributors.
- Land outline for the coverage hatching: [Natural Earth](https://www.naturalearthdata.com/) 1:50m land (public domain), in `updater/data/`.

## Development

- `npm ci`, then `npm run update-data -- --offline --providers geofabrik,osmfr` to build `data/` from the local HTTP cache (or drop `--offline` to fetch Geofabrik).
- `npm run dev` serves the app at http://localhost:5173/. Put a development MapTiler key in `web/public/config.json` as `{ "maptilerKey": "…" }`; without one the app uses a keyless demo basemap.
- `npm test`, `npm run test:coverage` and `npm run check` (type check and lint).

## Deployment

`compose.yaml` runs two services: `web` (nginx serving the built app and the current data release) and `updater` (refreshes Geofabrik weekly with supercronic). Both image builds run the type check, lint and tests first, so a failing test blocks the build.

Environment variables:

- `MAPTILER_KEY` (web): the basemap key. It's public, so restrict it to the site's origin in the MapTiler dashboard.
- `CRON_SCHEDULE` (updater): default `0 3 * * 1` (Mondays 03:00 UTC).
- `REQUEST_INTERVAL_MS` (updater): Geofabrik request spacing, default 1000. OSM-FR always waits at least 2 s.
- `UPDATE_MAX_AGE_DAYS` (updater): the healthcheck reports unhealthy if Geofabrik wasn't checked successfully within this many days. Default 8; raise it if `CRON_SCHEDULE` runs less often than weekly.

Healthchecks: `web` is healthy while nginx serves the app. `updater` is healthy while the published Geofabrik data is recent and wasn't reused after a failed fetch, so a failing weekly update shows up as unhealthy. OpenStreetMap France isn't checked, since it's updated by hand.

`web` isn't published on the host; put a reverse proxy (e.g. Coolify's) in front of port 80. To try it locally, copy `compose.override.example.yaml` to `compose.override.yaml`, run `MAPTILER_KEY=… docker compose up -d --build`, and open http://127.0.0.1:8080/.

On first start the updater fetches Geofabrik straight away. OpenStreetMap France is only fetched by hand:

- Geofabrik now: `docker compose exec updater npm run update-data`
- OpenStreetMap France (about 1.5 hours): `docker compose exec -d updater sh -c 'npm run update-data -- --providers osmfr > /proc/1/fd/1 2>&1'`, then follow it with `docker compose logs -f updater`. (Output from a detached `exec` is otherwise lost; writing to the main process's output puts it in the container logs.)

A run started while another is in progress exits straight away.
