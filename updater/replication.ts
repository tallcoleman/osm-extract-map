import type { ReplicationInterval, ReplicationStatus } from "../shared/schema.ts";

/** "none" without change files, "differs" if the provider's default interval isn't offered. */
export function replicationStatus(
  intervals: readonly ReplicationInterval[],
  expected: ReplicationInterval,
): ReplicationStatus {
  if (intervals.length === 0) return "none";
  return intervals.includes(expected) ? "expected" : "differs";
}
