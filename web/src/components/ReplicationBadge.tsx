import type { Extract } from "../../../shared/schema.ts";
import { replicationBadge } from "../lib/badges.ts";

export function ReplicationBadge({ extract }: { extract: Pick<Extract, "provider" | "replication"> }) {
  const badge = replicationBadge(extract);
  if (!badge) return null;
  return (
    <span className={`badge badge-${badge.kind}`}>
      <span aria-hidden="true">{badge.kind === "warning" ? "⚠ " : "ⓘ "}</span>
      {badge.text}
    </span>
  );
}
