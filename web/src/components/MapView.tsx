import type { ExpressionSpecification, MapGeoJSONFeature, MapSourceDataEvent } from "maplibre-gl";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import MapGL, { AttributionControl, GeolocateControl, Layer, type MapLayerMouseEvent, type MapRef, NavigationControl, Popup, Source } from "react-map-gl/maplibre";
import {
  type BoundaryCollection,
  type Extract,
  type GapCollection,
  PROVIDER_IDS,
  type ProviderId,
  providerSetKey,
} from "../../../shared/schema.ts";
import type { BBox } from "../lib/geo.ts";
import { HATCH_IMAGE, hatchImage } from "../lib/hatch.ts";
import { type Level, levelFilters } from "../lib/levels.ts";
import { NARROW_SCREEN, useMediaQuery } from "../lib/media.ts";
import { pickerCandidates } from "../lib/picker.ts";
import { PROVIDER_ATTRIBUTION, PROVIDER_COLORS, providerOfKey } from "../lib/providers.ts";
import { OverlapPicker } from "./OverlapPicker.tsx";
import { HoverTooltip } from "./HoverTooltip.tsx";

/** Hover waits until the cursor settles, so sweeping across many areas doesn't queue up redraws. */
export const HOVER_DELAY_MS = 60;

export interface ZoomRequest {
  bbox: BBox;
  /** Changes on every request, so zooming to the same extract twice works. */
  id: number;
}

export interface MapViewProps {
  styleUrl: string;
  boundaries: Partial<Record<ProviderId, BoundaryCollection>>;
  /** Providers to draw; the others stay loaded but hidden. */
  providers: readonly ProviderId[];
  level: Level;
  selected: readonly string[];
  /** Extract hovered or focused in the list. */
  highlighted: string | null;
  extractsByKey: ReadonlyMap<string, Extract>;
  zoomTo: ZoomRequest | null;
  /** Land with no extract drawn, hatched; null until loaded or if unavailable. */
  gaps: GapCollection | null;
  onToggle: (key: string) => void;
}

type FlagState = { selected: boolean; hover: boolean };

const flag = (name: keyof FlagState): ExpressionSpecification => ["boolean", ["feature-state", name], false];

export const layerIds = (p: ProviderId) => ({
  fill: `${p}-fill`,
  coarser: `${p}-coarser`,
  line: `${p}-line`,
  selected: `${p}-selected`,
});

/** Matches the selected extracts of one provider. */
export function selectedFilter(selected: readonly string[], provider: ProviderId): ExpressionSpecification {
  return ["in", ["get", "key"], ["literal", selected.filter((k) => providerOfKey(k) === provider)]];
}

export const GAPS_LAYER = "gaps-hatch";

/** Matches the gap feature for the providers shown at a level. */
export function gapFilter(providers: readonly ProviderId[], level: Level): ExpressionSpecification {
  return ["all", ["==", ["get", "providers"], providerSetKey(providers)], ["==", ["get", "level"], level]];
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function MapViewImpl(props: MapViewProps) {
  const { boundaries, providers, level, selected, highlighted, extractsByKey, zoomTo, gaps, onToggle } = props;
  const mapRef = useRef<MapRef>(null);
  const [cursorKeys, setCursorKeys] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; width: number; height: number; extracts: Extract[] } | null>(null);
  // `low`: the click was in the top half of the map, so the phone panel docks at the bottom.
  const [picker, setPicker] = useState<{ longitude: number; latitude: number; low: boolean; extracts: Extract[] } | null>(null);
  // On phones the map is short, so the picker is a panel inside it rather than a popup at the tap.
  const narrow = useMediaQuery(NARROW_SCREEN);
  // The gaps layer waits for its pattern image, which can only be added once the style has loaded.
  const [hatchReady, setHatchReady] = useState(false);
  const hoverTimer = useRef<number | undefined>(undefined);
  // True while the map pans or zooms; hover is paused then.
  const moving = useRef(false);
  // Feature state last set on the map, per key, so only changes are sent.
  const applied = useRef(new Map<string, FlagState>());

  const loaded = PROVIDER_IDS.filter((p) => boundaries[p]);
  const filters = levelFilters(level);

  // Hover and selection use feature state rather than layer filters: changing
  // a filter makes MapLibre rebuild the layer, while feature state only repaints.
  const syncFeatureState = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const hover = new Set(cursorKeys);
    if (highlighted) hover.add(highlighted);
    const sel = new Set(selected);
    for (const key of new Set([...applied.current.keys(), ...hover, ...sel])) {
      const source = providerOfKey(key);
      if (!source || !map.getSource(source)) continue;
      const next = { selected: sel.has(key), hover: hover.has(key) };
      const prev = applied.current.get(key);
      if (prev && prev.selected === next.selected && prev.hover === next.hover) continue;
      map.setFeatureState({ source, id: key }, next);
      if (next.selected || next.hover) applied.current.set(key, next);
      else applied.current.delete(key);
    }
  }, [cursorKeys, highlighted, selected]);

  useEffect(syncFeatureState, [syncFeatureState]);

  // When a source is (re)added its feature state is empty, so send it again.
  const onSourceData = useCallback(
    (e: MapSourceDataEvent) => {
      const p = PROVIDER_IDS.find((id) => id === e.sourceId);
      if (!p || e.sourceDataType !== "metadata") return;
      for (const key of [...applied.current.keys()]) if (providerOfKey(key) === p) applied.current.delete(key);
      syncFeatureState();
    },
    [syncFeatureState],
  );

  useEffect(() => {
    if (!zoomTo) return;
    const [w, s, e, n] = zoomTo.bbox;
    mapRef.current?.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 40, maxZoom: 10, duration: reducedMotion() ? 0 : 800 },
    );
  }, [zoomTo]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const extractsAt = (features: readonly MapGeoJSONFeature[] | undefined) => pickerCandidates(features ?? [], extractsByKey);

  const onMouseMove = (e: MapLayerMouseEvent) => {
    if (moving.current) return;
    const found = extractsAt(e.features);
    const { x, y } = e.point;
    const { clientWidth: width, clientHeight: height } = e.target.getContainer();
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      setCursorKeys((prev) => {
        const next = found.map((f) => f.key);
        return prev.join() === next.join() ? prev : next;
      });
      setTooltip(found.length ? { x, y, width, height, extracts: found } : null);
    }, HOVER_DELAY_MS);
  };

  const clearHover = () => {
    window.clearTimeout(hoverTimer.current);
    setCursorKeys([]);
    setTooltip(null);
  };

  // Hides the tooltip when the map moves, which matters most on touch screens,
  // where there's no cursor to move off the area afterwards.
  const onMoveStart = () => {
    moving.current = true;
    clearHover();
  };

  const onClick = (e: MapLayerMouseEvent) => {
    const found = extractsAt(e.features);
    if (found.length > 1) {
      setTooltip(null);
      setPicker({ longitude: e.lngLat.lng, latitude: e.lngLat.lat, low: e.point.y < e.target.getContainer().clientHeight / 2, extracts: found });
      return;
    }
    setPicker(null);
    if (found.length === 1) onToggle(found[0]!.key);
  };

  const closePicker = useCallback(() => {
    setPicker(null);
    mapRef.current?.getCanvas().focus();
  }, []);

  const pickerContent = picker && (
    <OverlapPicker
      key={`${picker.longitude},${picker.latitude}`}
      extracts={picker.extracts} selected={selected} onToggle={onToggle} onClose={closePicker} />
  );

  return (
    <div className="map-wrap">
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 10, latitude: 30, zoom: 1.3 }}
        mapStyle={props.styleUrl}
        attributionControl={false}
        interactiveLayerIds={providers.map((p) => layerIds(p).fill)}
        onMouseMove={onMouseMove}
        onMouseLeave={clearHover}
        onMoveStart={onMoveStart}
        onMoveEnd={() => void (moving.current = false)}
        onClick={onClick}
        onSourceData={onSourceData}
        onLoad={() => {
          const map = mapRef.current!;
          if (!map.hasImage(HATCH_IMAGE)) map.addImage(HATCH_IMAGE, hatchImage(), { pixelRatio: 2 });
          setHatchReady(true);
          performance.mark("map-load");
        }}
        onIdle={() => performance.getEntriesByName("map-idle").length || performance.mark("map-idle")}
        cursor={cursorKeys.length ? "pointer" : "grab"}
      >
        <NavigationControl position="top-right" showCompass={false} />
        {/* Centres the map on the user's location; the position never leaves the browser. */}
        <GeolocateControl position="top-right" fitBoundsOptions={{ maxZoom: 8 }} />
        <AttributionControl position="bottom-right" />
        {gaps && hatchReady && (
          <Source id="gaps" type="geojson" data={gaps}>
            <Layer id={GAPS_LAYER} type="fill" filter={gapFilter(providers, level)} paint={{ "fill-pattern": HATCH_IMAGE }} />
          </Source>
        )}
        {loaded.map((p) => {
          const ids = layerIds(p);
          const color = PROVIDER_COLORS[p];
          const visibility = providers.includes(p) ? "visible" : "none";
          // Keeps the two providers' outlines from drawing exactly on top of each other.
          const offset = p === "osmfr" ? 1.5 : 0;
          return (
            <Source key={p} id={p} type="geojson" data={boundaries[p]!} promoteId="key" attribution={PROVIDER_ATTRIBUTION[p]}>
              <Layer
                id={ids.fill}
                type="fill"
                filter={filters.any}
                layout={{ visibility }}
                paint={{ "fill-color": color, "fill-opacity": ["case", flag("selected"), 0.3, flag("hover"), 0.12, 0] }}
              />
              <Layer
                id={ids.coarser}
                type="line"
                filter={filters.coarser}
                layout={{ visibility }}
                paint={{
                  "line-color": color,
                  "line-width": ["case", flag("hover"), 2.5, 1],
                  "line-opacity": ["case", flag("hover"), 1, 0.55],
                  "line-dasharray": [3, 2],
                  "line-offset": offset,
                }}
              />
              <Layer
                id={ids.line}
                type="line"
                filter={filters.normal}
                layout={{ visibility }}
                paint={{ "line-color": color, "line-width": ["case", flag("hover"), 2.5, 1.2], "line-offset": offset }}
              />
              {/*
                Filtered to the selected keys and not the level, so a selected extract
                stays outlined at every level. The filter changes only on clicks; drawing
                every feature here and hiding the unselected ones made panning much slower.
              */}
              <Layer
                id={ids.selected}
                type="line"
                filter={selectedFilter(selected, p)}
                layout={{ visibility }}
                paint={{ "line-color": color, "line-width": 3, "line-offset": offset }}
              />
            </Source>
          );
        })}
        {picker && !narrow && (
          <Popup
            longitude={picker.longitude}
            latitude={picker.latitude}
            closeButton={false}
            closeOnClick={false}
            maxWidth="320px"
            onClose={() => setPicker(null)}
          >
            {pickerContent}
          </Popup>
        )}
      </MapGL>
      {picker && narrow && <div className={picker.low ? "picker-panel picker-panel-low" : "picker-panel"}>{pickerContent}</div>}
      {tooltip && !picker && <HoverTooltip {...tooltip} />}
    </div>
  );
}

export const MapView = memo(MapViewImpl);
