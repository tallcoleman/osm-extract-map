import { type Extract, PROVIDERS, type ReplicationInterval } from "../../../shared/schema.ts";
import { PROVIDER_LABELS } from "./providers.ts";

const ADVERB: Record<ReplicationInterval, string> = { minute: "minutely", hour: "hourly", day: "daily" };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "minutely", "hourly and daily", "minutely, hourly and daily". */
export function intervalList(intervals: readonly ReplicationInterval[]): string {
  const words = intervals.map((i) => ADVERB[i]);
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

export interface Badge {
  kind: "warning" | "notice";
  text: string;
}

/** Badge for an extract's change files; null when they're normal for the provider. */
export function replicationBadge(e: Pick<Extract, "provider" | "replication">): Badge | null {
  const { status, intervals } = e.replication;
  if (status === "none") return { kind: "warning", text: "No change files" };
  if (status === "differs") {
    const expected = ADVERB[PROVIDERS[e.provider].expectedInterval];
    return { kind: "notice", text: `${capitalize(intervalList(intervals))} updates only (${PROVIDER_LABELS[e.provider]} default is ${expected})` };
  }
  return null;
}

/** Plain detail for the selection panel, e.g. "Daily updates". */
export function replicationDetail(e: Pick<Extract, "replication">): string {
  return e.replication.intervals.length ? `${capitalize(intervalList(e.replication.intervals))} updates` : "No updates";
}
