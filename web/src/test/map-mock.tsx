// Stand-in for react-map-gl/maplibre in jsdom, which has no WebGL. Renders
// sources and layers as plain elements and records the props passed in, so
// tests can check them and call the event handlers directly.
import { type ReactNode, type Ref, useEffect, useImperativeHandle } from "react";
import { vi } from "vitest";

const sources = new Set<string>();
const canvas = document.createElement("canvas");
canvas.tabIndex = 0;

export const fakeMap = {
  setFeatureState: vi.fn<(f: { source: string; id: string }, state: Record<string, boolean>) => void>(),
  getSource: vi.fn((id: string) => (sources.has(id) ? {} : undefined)),
  fitBounds: vi.fn<(bounds: unknown, options: { duration?: number }) => void>(),
  getCanvas: () => canvas,
};

// oxlint-disable-next-line typescript/no-explicit-any -- props of the real component
export let mapProps: Record<string, any> = {};

export function resetMapMock() {
  sources.clear();
  fakeMap.setFeatureState.mockReset();
  fakeMap.getSource.mockClear();
  fakeMap.fitBounds.mockReset();
  mapProps = {};
}

/** Removes a source, as if MapLibre hadn't added it yet. */
export function dropSource(id: string) {
  sources.delete(id);
}

export function addSource(id: string) {
  sources.add(id);
}

export default function MapGL({ ref, children, ...props }: { ref?: Ref<unknown>; children?: ReactNode }) {
  useImperativeHandle(ref, () => fakeMap);
  // oxlint-disable-next-line react/globals -- recording the latest props is the point of this mock
  mapProps = props;
  return (
    <div data-testid="map" ref={(el) => void (el && canvas.parentNode !== el && el.append(canvas))}>
      {children}
    </div>
  );
}

export function Source({ id, children, attribution, promoteId }: { id: string; children?: ReactNode; attribution?: string; promoteId?: string }) {
  useEffect(() => {
    sources.add(id);
    return () => void sources.delete(id);
  }, [id]);
  return (
    <div data-source={id} data-attribution={attribution} data-promote-id={promoteId}>
      {children}
    </div>
  );
}

export function Layer(props: { id: string; type: string; filter?: unknown; layout?: { visibility?: string }; paint?: unknown }) {
  return (
    <div
      data-layer={props.id}
      data-type={props.type}
      data-filter={props.filter === undefined ? undefined : JSON.stringify(props.filter)}
      data-visibility={props.layout?.visibility}
      data-paint={JSON.stringify(props.paint)}
    />
  );
}

export function Popup({ children, longitude, latitude }: { children?: ReactNode; longitude: number; latitude: number }) {
  return (
    <div data-testid="popup" data-lnglat={`${longitude},${latitude}`}>
      {children}
    </div>
  );
}

export const NavigationControl = () => null;
export const AttributionControl = () => null;
