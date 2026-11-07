import { describe, expect, it } from "vitest";
import type { ProviderId, ReplicationInterval, ReplicationStatus } from "../../../shared/schema.ts";
import { intervalList, replicationBadge, replicationDetail } from "./badges.ts";

const ext = (provider: ProviderId, status: ReplicationStatus, intervals: ReplicationInterval[]) => ({
  provider,
  replication: { available: intervals.length > 0, intervals, status },
});

describe("replicationBadge", () => {
  it.each([
    [ext("osmfr", "expected", ["minute"]), null],
    [ext("osmfr", "expected", ["minute", "hour"]), null],
    [ext("geofabrik", "expected", ["day"]), null],
    [ext("osmfr", "none", []), { kind: "warning", text: "No change files" }],
    [ext("geofabrik", "none", []), { kind: "warning", text: "No change files" }],
    [ext("osmfr", "differs", ["hour"]), { kind: "notice", text: "Hourly updates only (OSM-FR default is minutely)" }],
    [ext("osmfr", "differs", ["hour", "day"]), { kind: "notice", text: "Hourly and daily updates only (OSM-FR default is minutely)" }],
    [ext("geofabrik", "differs", ["minute"]), { kind: "notice", text: "Minutely updates only (Geofabrik default is daily)" }],
  ])("%o → %o", (e, badge) => {
    expect(replicationBadge(e)).toEqual(badge);
  });
});

describe("intervalList", () => {
  it("joins with commas and 'and'", () => {
    expect(intervalList([])).toBe("");
    expect(intervalList(["day"])).toBe("daily");
    expect(intervalList(["minute", "hour", "day"])).toBe("minutely, hourly and daily");
  });
});

describe("replicationDetail", () => {
  it("names the intervals, or says there are none", () => {
    expect(replicationDetail(ext("geofabrik", "expected", ["day"]))).toBe("Daily updates");
    expect(replicationDetail(ext("osmfr", "none", []))).toBe("No updates");
  });
});
