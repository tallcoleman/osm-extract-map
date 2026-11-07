import type { Extract, ProviderId } from "../../../shared/schema.ts";

/** Selected extract keys, in the order they were selected. */
export type Selection = readonly string[];

export type SelectionAction = { type: "toggle"; key: string } | { type: "remove"; key: string } | { type: "clear" };

export function selectionReducer(state: Selection, action: SelectionAction): Selection {
  switch (action.type) {
    case "toggle":
      return state.includes(action.key) ? state.filter((k) => k !== action.key) : [...state, action.key];
    case "remove":
      return state.includes(action.key) ? state.filter((k) => k !== action.key) : state;
    case "clear":
      return state.length ? [] : state;
  }
}

export interface SizeTotal {
  count: number;
  /** Sum of the known sizes. */
  bytes: number;
  /** Extracts with no known size, left out of `bytes`. */
  unknown: number;
}

export interface Totals extends SizeTotal {
  byProvider: Partial<Record<ProviderId, SizeTotal>>;
}

/** Estimated total download size. Overlap (e.g. a country and its regions) isn't removed. */
export function selectionTotals(extracts: readonly Extract[]): Totals {
  const totals: Totals = { count: 0, bytes: 0, unknown: 0, byProvider: {} };
  for (const e of extracts) {
    const p = (totals.byProvider[e.provider] ??= { count: 0, bytes: 0, unknown: 0 });
    for (const t of [totals, p]) {
      t.count++;
      if (e.sizeBytes === null) t.unknown++;
      else t.bytes += e.sizeBytes;
    }
  }
  return totals;
}
