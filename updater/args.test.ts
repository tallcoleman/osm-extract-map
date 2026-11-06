import { describe, expect, it } from "vitest";
import { ArgsError, parseUpdateArgs } from "./args.ts";

describe("parseUpdateArgs", () => {
  it("defaults to an online Geofabrik-only run, never OSM-FR", () => {
    expect(parseUpdateArgs([])).toEqual({ providers: ["geofabrik"], mode: "online", skipSizes: false });
  });

  it.each([
    [["--providers", "osmfr"], ["osmfr"]],
    [["--providers", "geofabrik,osmfr"], ["geofabrik", "osmfr"]],
    [["--providers=osmfr, geofabrik,osmfr"], ["osmfr", "geofabrik"]],
  ])("%j → providers %j", (argv, providers) => {
    expect(parseUpdateArgs(argv).providers).toEqual(providers);
  });

  it("reads the mode and --skip-sizes", () => {
    expect(parseUpdateArgs(["--offline"]).mode).toBe("offline");
    expect(parseUpdateArgs(["--record"]).mode).toBe("record");
    expect(parseUpdateArgs(["--skip-sizes"]).skipSizes).toBe(true);
  });

  it.each([
    [["--offline", "--record"], /can't be combined/],
    [["--providers", "osm-fr"], /Unknown provider "osm-fr"/],
    [["--providers", ","], /at least one provider/],
    [["--providers"], /argument missing/],
    [["--verbose"], /Unknown option/],
    [["osmfr"], /positional/],
  ])("rejects %j", (argv, message) => {
    expect(() => parseUpdateArgs(argv)).toThrow(ArgsError);
    expect(() => parseUpdateArgs(argv)).toThrow(message);
  });
});
