// Phase 2 debug map: draws each provider's boundaries at one depth at a time,
// to check by eye how depth works as a level. No real UI; see docs/implementation-plan.md.
//
// Run with `npm run dev`, then open http://localhost:5173/debug.html

import "maplibre-gl/dist/maplibre-gl.css";
import type { ExpressionSpecification } from "maplibre-gl";
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import MapGL, { Layer, type MapLayerMouseEvent, type MapRef, Source } from "react-map-gl/maplibre";
import { type BoundaryCollection, type BoundaryProperties, type Meta, PROVIDER_IDS, type ProviderId } from "../../../shared/schema.ts";

const COLORS: Record<ProviderId, string> = { geofabrik: "#0072b2", osmfr: "#d55e00" };
// Bundles share their outer edge with their parts, so they need their own colour to show up.
const BUNDLE_COLOR = "#cc79a7";
/** Hover waits until the cursor settles for this long, so sweeping across many areas doesn't queue up redraws. */
const HOVER_DELAY_MS = 60;
const hovering = (on: number, off: number): ExpressionSpecification => ["case", ["boolean", ["feature-state", "hover"], false], on, off];
// Used when web/public/config.json has no MapTiler key.
const FALLBACK_STYLE = "https://demotiles.maplibre.org/style.json";

type Level = number | "smallest";

interface Loaded {
  meta: Meta;
  boundaries: Partial<Record<ProviderId, BoundaryCollection>>;
  loadMs: number;
  bytes: number;
}

async function load(): Promise<Loaded> {
  const start = performance.now();
  let bytes = 0;
  const getJson = async <T,>(url: string): Promise<T> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const text = await res.text();
    bytes += text.length;
    return JSON.parse(text) as T;
  };
  const meta = await getJson<Meta>("/data/meta.json");
  const entries = await Promise.all(
    Object.entries(meta.files.boundaries).map(async ([p, file]) => [p, await getJson<BoundaryCollection>(`/data/${file}`)] as const),
  );
  return { meta, boundaries: Object.fromEntries(entries), loadMs: performance.now() - start, bytes };
}

async function loadStyle(): Promise<string> {
  try {
    const res = await fetch("/config.json");
    const key = res.ok ? ((await res.json()) as { maptilerKey?: string }).maptilerKey : undefined;
    if (key) return `https://api.maptiler.com/maps/dataviz/style.json?key=${encodeURIComponent(key)}`;
  } catch {
    // No config.json: use the fallback style.
  }
  return FALLBACK_STYLE;
}

const notBundle: ExpressionSpecification = ["!", ["get", "isBundle"]];

/** Filters for the normal and "coarser" (leaf above the chosen depth) layers. */
function filters(level: Level): { normal: ExpressionSpecification; coarser: ExpressionSpecification | null } {
  if (level === "smallest") return { normal: ["all", ["get", "isLeaf"], notBundle], coarser: null };
  return {
    normal: ["all", ["==", ["get", "depth"], level], notBundle],
    coarser: ["all", ["<", ["get", "depth"], level], ["get", "isLeaf"], notBundle],
  };
}

function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>("smallest");
  const [shown, setShown] = useState<Record<ProviderId, boolean>>({ geofabrik: true, osmfr: true });
  const [bundles, setBundles] = useState(false);
  const [hover, setHover] = useState<BoundaryProperties[]>([]);
  const [idleMs, setIdleMs] = useState<number | null>(null);
  const mapRef = useRef<MapRef>(null);
  const hovered = useRef<{ source: ProviderId; id: string }[]>([]);
  const hoverTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    load().then(setData, (e: Error) => setError(e.message));
    loadStyle().then(setStyle);
  }, []);

  const maxDepth = useMemo(
    () => Math.max(0, ...Object.values(data?.boundaries ?? {}).flatMap((fc) => fc.features.map((f) => f.properties.depth))),
    [data],
  );
  const counts = useMemo(() => {
    const out: Partial<Record<ProviderId, { normal: number; coarser: number }>> = {};
    for (const [p, fc] of Object.entries(data?.boundaries ?? {}) as [ProviderId, BoundaryCollection][]) {
      const props = fc.features.map((f) => f.properties).filter((f) => !f.isBundle);
      out[p] =
        level === "smallest"
          ? { normal: props.filter((f) => f.isLeaf).length, coarser: 0 }
          : {
              normal: props.filter((f) => f.depth === level).length,
              coarser: props.filter((f) => f.depth < level && f.isLeaf).length,
            };
    }
    return out;
  }, [data, level]);

  const { normal, coarser } = filters(level);
  const providers = PROVIDER_IDS.filter((p) => data?.boundaries[p] && shown[p]);
  // Hover uses feature state rather than layer filters: changing a filter makes
  // MapLibre rebuild the layer, while feature state only repaints.
  const applyHover = (props: BoundaryProperties[]) => {
    const map = mapRef.current;
    const next = props.map((h) => ({ source: h.key.slice(0, h.key.indexOf(":")) as ProviderId, id: h.key }));
    if (next.map((f) => f.id).join() === hovered.current.map((f) => f.id).join()) return;
    if (map) {
      for (const f of hovered.current) if (map.getSource(f.source)) map.setFeatureState(f, { hover: false });
      for (const f of next) map.setFeatureState(f, { hover: true });
    }
    hovered.current = next;
    setHover(props);
  };
  const onMove = (e: MapLayerMouseEvent) => {
    const props = (e.features ?? []).map((f) => f.properties as BoundaryProperties).filter((p, i, a) => a.findIndex((q) => q.key === p.key) === i);
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => applyHover(props), HOVER_DELAY_MS);
  };
  const onLeave = () => {
    window.clearTimeout(hoverTimer.current);
    applyHover([]);
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 280, padding: 12, overflow: "auto", borderRight: "1px solid #ccc" }}>
        <h1 style={{ fontSize: 16, margin: "0 0 8px" }}>Debug map</h1>
        {error && <p style={{ color: "#b00" }}>Failed to load data: {error}. Run <code>npm run update-data -- --offline</code>.</p>}
        {data && (
          <p>
            Loaded {(data.bytes / 1024 / 1024).toFixed(1)} MB in {Math.round(data.loadMs)} ms
            {idleMs !== null && <>; first idle map {Math.round(idleMs)} ms after page start</>}.
          </p>
        )}
        <fieldset>
          <legend>Level</legend>
          {(["smallest", ...Array.from({ length: maxDepth + 1 }, (_, i) => i)] as Level[]).map((l) => (
            <label key={l} style={{ display: "block" }}>
              <input type="radio" checked={level === l} onChange={() => setLevel(l)} /> {l === "smallest" ? "Smallest available" : `Depth ${l}`}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Providers</legend>
          {PROVIDER_IDS.map((p) => (
            <label key={p} style={{ display: "block", color: COLORS[p] }}>
              <input type="checkbox" checked={shown[p]} onChange={(e) => setShown({ ...shown, [p]: e.target.checked })} /> {p}{" "}
              {counts[p] && (
                <span style={{ color: "#555" }}>
                  ({counts[p].normal}
                  {level !== "smallest" && <> + {counts[p].coarser} coarser</>})
                </span>
              )}
            </label>
          ))}
          <label style={{ display: "block" }}>
            <input type="checkbox" checked={bundles} onChange={(e) => setBundles(e.target.checked)} />{" "}
            <span style={{ color: BUNDLE_COLOR }}>Bundles</span> (pink, dashed)
          </label>
        </fieldset>
        <p style={{ color: "#555" }}>Solid: at this depth. Dashed and faint: coarser fallback (a leaf above this depth).</p>
        <h2 style={{ fontSize: 14 }}>Under the cursor</h2>
        {hover.length === 0 && <p style={{ color: "#555" }}>Nothing.</p>}
        {hover.map((h) => (
          <div key={h.key} style={{ marginBottom: 6 }}>
            <strong>{h.name}</strong>
            <br />
            <code>{h.key}</code>
            <br />
            depth {h.depth}
            {h.isLeaf && ", leaf"}
            {h.isBundle && ", bundle"}
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }}>
        {style && (
          <MapGL
            initialViewState={{ longitude: 10, latitude: 35, zoom: 1.5 }}
            ref={mapRef}
            mapStyle={style}
            interactiveLayerIds={providers.flatMap((p) => (bundles ? [`${p}-hit`, `${p}-bundles-fill`] : [`${p}-hit`]))}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
            onIdle={() => setIdleMs((v) => v ?? (data ? performance.now() : null))}
          >
            {providers.map((p) => (
              <Source key={p} id={p} type="geojson" data={data!.boundaries[p]!} promoteId="key">
                <Layer
                  id={`${p}-hit`}
                  type="fill"
                  filter={coarser ? ["any", normal, coarser] : normal}
                  paint={{ "fill-color": COLORS[p], "fill-opacity": 0.04 }}
                />
                {coarser && (
                  <Layer
                    id={`${p}-coarser`}
                    beforeId={`${p}-line`}
                    type="line"
                    filter={coarser}
                    paint={{ "line-color": COLORS[p], "line-width": 1, "line-opacity": 0.5, "line-dasharray": [3, 2] }}
                  />
                )}
                <Layer
                  id={`${p}-line`}
                  type="line"
                  filter={normal}
                  paint={{ "line-color": COLORS[p], "line-width": 1.2, "line-offset": p === "osmfr" ? 1 : 0 }}
                />
                {bundles && (
                  <Layer
                    id={`${p}-bundles-fill`}
                    beforeId={`${p}-hover-fill`}
                    type="fill"
                    filter={["get", "isBundle"]}
                    paint={{ "fill-color": BUNDLE_COLOR, "fill-opacity": 0.12 }}
                  />
                )}
                {bundles && (
                  <Layer
                    id={`${p}-bundles`}
                    beforeId={`${p}-hover-fill`}
                    type="line"
                    filter={["get", "isBundle"]}
                    paint={{ "line-color": BUNDLE_COLOR, "line-width": 2, "line-dasharray": [2, 1.5] }}
                  />
                )}
                {/* Only hovered features are drawn, through feature state. */}
                <Layer id={`${p}-hover-fill`} type="fill" paint={{ "fill-color": COLORS[p], "fill-opacity": hovering(0.25, 0) }} />
                <Layer
                  id={`${p}-hover-line`}
                  type="line"
                  paint={{ "line-color": COLORS[p], "line-width": 2.5, "line-opacity": hovering(1, 0) }}
                />
              </Source>
            ))}
          </MapGL>
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
