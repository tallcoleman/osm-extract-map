import type { BoundaryGeometry, Extract } from "../../shared/schema.ts";

/** An extract as a provider reports it, before levels and replication status are set. */
export interface ExtractDraft extends Omit<Extract, "depth" | "isLeaf" | "isBundle" | "replication"> {
  replication: Omit<Extract["replication"], "status">;
}

export interface ProviderData {
  extracts: ExtractDraft[];
  /** Geometry per extract key. */
  geometries: Map<string, BoundaryGeometry>;
  /** ISO 8601; when the provider's main index was fetched. */
  fetchedAt: string;
}

export class ProviderFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderFormatError";
  }
}
