// Data types shared by the updater and the web app.

export const SCHEMA_VERSION = 2;

export type ProviderId = "geofabrik" | "osmfr";

export const PROVIDER_IDS: readonly ProviderId[] = ["geofabrik", "osmfr"];

export type ReplicationInterval = "minute" | "hour" | "day";

export const REPLICATION_INTERVALS: readonly ReplicationInterval[] = ["minute", "hour", "day"];

/** Static per-provider settings, defined in code (not fetched). */
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  homepage: string;
  /** Host that serves this provider's downloads; every extract URL must be on it. */
  downloadHost: string;
  /** Default replication interval for this provider. */
  expectedInterval: ReplicationInterval;
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  geofabrik: {
    id: "geofabrik",
    name: "Geofabrik",
    homepage: "https://www.geofabrik.de/",
    downloadHost: "download.geofabrik.de",
    expectedInterval: "day",
  },
  osmfr: {
    id: "osmfr",
    name: "OpenStreetMap France",
    homepage: "https://www.openstreetmap.fr/",
    downloadHost: "download.openstreetmap.fr",
    expectedInterval: "minute",
  },
};

export type ReplicationStatus = "expected" | "differs" | "none";

export interface ExtractUrls {
  /** Provider's human-facing page (the primary link). */
  page: string | null;
  pbf: string | null;
  poly: string | null;
  /** Replication base URL (the directory containing state.txt). */
  replication: string | null;
}

export interface Extract {
  /** `${provider}:${id}`, globally unique. */
  key: string;
  provider: ProviderId;
  /** Provider-native id or path, e.g. "canada" (Geofabrik) or "north-america/canada/quebec" (OSM-FR). */
  id: string;
  name: string;
  parentKey: string | null;
  /** 0 = top level, after overrides. */
  depth: number;
  isLeaf: boolean;
  /** Repeats extracts the provider also offers separately (e.g. Geofabrik's "dach"); left out of level views. */
  isBundle: boolean;
  /** Estimated download size; null if unknown. */
  sizeBytes: number | null;
  sizeCheckedAt: string | null;
  urls: ExtractUrls;
  replication: {
    available: boolean;
    /** All intervals offered. */
    intervals: ReplicationInterval[];
    /** "none" = no change files; "differs" = the provider's expected interval is not offered. */
    status: ReplicationStatus;
  };
}

export interface ProviderMeta {
  extractCount: number;
  /** When this provider's data was last fetched, not when the release was built. */
  fetchedAt: string;
  /** "stale" = reused previous data after a fetch failure. */
  status: "ok" | "stale";
}

export interface Meta {
  generatedAt: string;
  schemaVersion: number;
  /** A provider is absent until its first successful fetch. */
  providers: Partial<Record<ProviderId, ProviderMeta>>;
  files: {
    extracts: string;
    boundaries: Partial<Record<ProviderId, string>>;
  };
}

export type Position = number[];
export type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
export type BoundaryGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface BoundaryProperties {
  key: string;
  depth: number;
  isLeaf: boolean;
  isBundle: boolean;
  name: string;
}

export interface BoundaryFeature {
  type: "Feature";
  properties: BoundaryProperties;
  geometry: BoundaryGeometry;
}

export interface BoundaryCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

export const EXTRACTS_FILE = "extracts.json";
export const META_FILE = "meta.json";
export const boundariesFile = (provider: ProviderId) => `boundaries-${provider}.geojson`;
