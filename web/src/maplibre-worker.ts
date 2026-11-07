// MapLibre 6 loads its worker from a file next to its own module. A production
// build moves the module into assets/ without that file, so point MapLibre at
// a copy that Vite emits (hashed, served by us, so CSP needs worker-src 'self').
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

setWorkerUrl(workerUrl);
