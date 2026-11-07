import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { type Extract, PROVIDER_IDS } from "../../shared/schema.ts";
import { ExtractList } from "./components/ExtractList.tsx";
import { Header } from "./components/Header.tsx";
import { LevelSelector } from "./components/LevelSelector.tsx";
import { MapView, type ZoomRequest } from "./components/MapView.tsx";
import { ProviderToggle } from "./components/ProviderToggle.tsx";
import { SelectionPanel } from "./components/SelectionPanel.tsx";
import { bboxIndex } from "./lib/geo.ts";
import type { Level } from "./lib/levels.ts";
import { type AppData, loadData as defaultLoadData, loadStyleUrl as defaultLoadStyleUrl } from "./lib/load.ts";
import { parentPaths } from "./lib/parents.ts";
import { type ProviderChoice, visibleProviders } from "./lib/providers.ts";
import { type SortOrder, visibleExtracts } from "./lib/search.ts";
import { selectionReducer } from "./lib/selection.ts";

export interface AppProps {
  loadData?: () => Promise<AppData>;
  loadStyleUrl?: () => Promise<string>;
}

type Status = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: AppData };

export function App({ loadData = defaultLoadData, loadStyleUrl = defaultLoadStyleUrl }: AppProps) {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [styleUrl, setStyleUrl] = useState<string | null>(null);

  const start = useCallback(() => {
    loadData().then(
      (data) => setStatus({ state: "ready", data }),
      (e: unknown) => setStatus({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  }, [loadData]);

  useEffect(start, [start]);

  useEffect(() => {
    loadStyleUrl().then(setStyleUrl);
  }, [loadStyleUrl]);

  return (
    <div className="app">
      {status.state === "ready" ? (
        <Explorer data={status.data} styleUrl={styleUrl} />
      ) : (
        <>
          <aside className="sidebar">
            <Header />
            {status.state === "loading" ? (
              <p className="panel" role="status">
                Loading extracts…
              </p>
            ) : (
              <div className="panel error" role="alert">
                <p>The extract data couldn't be loaded: {status.message}</p>
                <button type="button" onClick={() => {
                    setStatus({ state: "loading" });
                    start();
                  }}>
                  Try again
                </button>
              </div>
            )}
          </aside>
          <main className="map" aria-label="Map of extract boundaries" />
        </>
      )}
    </div>
  );
}

/** The controls, list and map, once data has loaded. */
function Explorer({ data, styleUrl }: { data: AppData; styleUrl: string | null }) {
  const [choice, setChoice] = useState<ProviderChoice>("both");
  const [level, setLevel] = useState<Level>("smallest");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("name");
  const [selected, dispatch] = useReducer(selectionReducer, []);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [zoomTo, setZoomTo] = useState<ZoomRequest | null>(null);

  const available = useMemo(() => PROVIDER_IDS.filter((p) => data.boundaries[p]), [data]);
  const providers = useMemo(() => visibleProviders(choice, available), [choice, available]);
  const byKey = useMemo(() => new Map(data.extracts.map((e) => [e.key, e])), [data]);
  const parents = useMemo(() => parentPaths(data.extracts), [data]);
  const bboxes = useMemo(() => bboxIndex(Object.values(data.boundaries)), [data]);
  const items = useMemo(() => visibleExtracts(data.extracts, { providers, level, query }), [data, providers, level, query]);
  const selectedExtracts = useMemo(() => selected.map((k) => byKey.get(k)).filter((e): e is Extract => !!e), [selected, byKey]);

  const toggle = useCallback((key: string) => dispatch({ type: "toggle", key }), []);
  const zoom = useCallback(
    (key: string) => {
      const bbox = bboxes.get(key);
      if (bbox) setZoomTo((z) => ({ bbox, id: (z?.id ?? 0) + 1 }));
    },
    [bboxes],
  );
  const activate = useCallback(
    (key: string) => {
      toggle(key);
      zoom(key);
    },
    [toggle, zoom],
  );
  const remove = useCallback((key: string) => dispatch({ type: "remove", key }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  return (
    <>
      <aside className="sidebar">
      <Header meta={data.meta} failed={data.failed} />
      <section className="panel controls" aria-label="Map options">
        <ProviderToggle value={choice} available={available} onChange={setChoice} />
        <LevelSelector value={level} onChange={setLevel} />
      </section>
      <SelectionPanel extracts={selectedExtracts} parents={parents} onRemove={remove} onClear={clear} onZoom={zoom} />
      <ExtractList
        items={items}
        parents={parents}
        selected={selected}
        query={query}
        sort={sort}
        onQueryChange={setQuery}
        onSortChange={setSort}
        onActivate={activate}
        onHighlight={setHighlighted}
      />
      </aside>
      <main className="map" aria-label="Map of extract boundaries">
        {styleUrl ? (
          <MapView
            styleUrl={styleUrl}
            boundaries={data.boundaries}
            providers={providers}
            level={level}
            selected={selected}
            highlighted={highlighted}
            extractsByKey={byKey}
            zoomTo={zoomTo}
            onToggle={toggle}
          />
        ) : (
          <p className="map-loading">Loading map…</p>
        )}
      </main>
    </>
  );
}
