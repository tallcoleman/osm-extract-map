import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeClock, makeLogger, makeTempDir, serveFixtureSite } from "../../test/helpers.ts";
import { getMockAgent } from "../../test/mock-agent.ts";
import { HttpClient, HttpError } from "../http.ts";
import { ListingParseError } from "../listing.ts";
import { displayName, fetchOsmfr, type OsmfrOptions } from "./osmfr.ts";

const HOST = "download.openstreetmap.fr";
const ORIGIN = `https://${HOST}`;

let tmp: Awaited<ReturnType<typeof makeTempDir>>;
beforeEach(async () => {
  tmp = await makeTempDir("osmfr-test-");
});
afterEach(() => tmp.cleanup());

function setup() {
  const clock = makeClock();
  const logger = makeLogger();
  const http = new HttpClient({
    cacheDir: tmp.dir,
    allowedHosts: [HOST],
    userAgent: "test",
    minIntervalMs: 0,
    maxRetries: 0,
    now: clock.now,
    sleep: clock.sleep,
    logger,
  });
  const run = (options: Partial<OsmfrOptions> = {}) => fetchOsmfr(http, { logger, ...options });
  return { http, logger, clock, run };
}

// A synthetic site. Each listing is [name, size?, date?]; names ending in "/" are directories.
type Row = [string, string?, string?];
function listing(urlPath: string, rows: Row[]): string {
  const lines = rows.map(
    ([name, size = name.endsWith("/") ? "-" : "1M", date = "05-Nov-2026 01:41"]) =>
      `<a href="${name}">${name}</a>                                ${date}    ${size}`,
  );
  return `<html>\r\n<head><title>Index of ${urlPath}</title></head>\r\n<body>\r\n<h1>Index of ${urlPath}</h1><hr><pre><a href="../">../</a>\r\n${lines.join("\r\n")}\r\n</pre><hr></body>\r\n</html>\r\n`;
}

const pool = () => getMockAgent().get(ORIGIN);
const serveListing = (urlPath: string, rows: Row[], times = 1) =>
  pool().intercept({ path: urlPath }).reply(200, listing(urlPath, rows)).times(times);
const servePoly = (urlPath: string, body = SQUARE, headers: Record<string, string> = {}) =>
  pool().intercept({ path: urlPath }).reply(200, body, { headers });
const pbf = (name: string, size?: string): Row[] => [
  [`${name}-latest.osm.pbf`, size],
  [`${name}.osm.pbf`, size],
  [`${name}.osm.pbf.md5`, "50"],
  [`${name}.state.txt`, "56"],
];

const SQUARE = "x\n1\n 0 0\n 1 0\n 1 1\nEND\nEND\n";

describe("displayName", () => {
  it.each([
    ["algeria", "Algeria"],
    ["burkina_faso", "Burkina Faso"],
    ["north-america", "North America"],
    ["nord_du_quebec", "Nord du Quebec"],
    ["sao_tome_and_principe", "Sao Tome and Principe"],
    ["saint_vincent_and_the_grenadines", "Saint Vincent and the Grenadines"],
    ["the_riverina", "The Riverina"],
    ["cote_d_or", "Cote d'Or"],
    ["val_d_oise", "Val d'Oise"],
    ["o_higgins", "O'Higgins"],
    ["moere_og_romsdal", "Moere og Romsdal"],
    ["tierra_del_fuego", "Tierra del Fuego"],
    ["us-midwest", "US Midwest"],
    ["usa_virgin_islands", "USA Virgin Islands"],
    ["france_taaf", "France TAAF"],
    ["ivano-frankivsk_oblast", "Ivano Frankivsk Oblast"],
    ["d", "D"],
    ["a__b", "A B"],
  ])("%s → %s", (segment, name) => expect(displayName(segment)).toBe(name));
});

describe("fetchOsmfr on the recorded subset", () => {
  it("builds extracts from listings, polygons and replication", async () => {
    const { run, logger } = setup();
    serveFixtureSite("fixtures/pipeline", HOST);
    const data = await run();

    expect(data.extracts.map((e) => e.id)).toEqual([
      "africa",
      "africa/bouvet_island",
      "africa/reunion",
      "africa/spain/ceuta",
      "north-america",
      "north-america/canada",
      "north-america/canada/quebec",
      "north-america/canada/quebec/laval",
      "russia",
      "russia/northwestern_federal_district",
      "russia/northwestern_federal_district/kaliningrad_oblast",
    ]);
    const ceuta = data.extracts.find((e) => e.id === "africa/spain/ceuta")!;
    expect(ceuta).toEqual({
      key: "osmfr:africa/spain/ceuta",
      provider: "osmfr",
      id: "africa/spain/ceuta",
      name: "Ceuta",
      // africa/spain/ has no extract of its own.
      parentKey: "osmfr:africa",
      sizeBytes: ceuta.sizeBytes,
      sizeCheckedAt: "2026-11-06T12:00:00.000Z",
      urls: {
        page: `${ORIGIN}/extracts/africa/spain/`,
        pbf: `${ORIGIN}/extracts/africa/spain/ceuta.osm.pbf`,
        poly: `${ORIGIN}/polygons/africa/spain/ceuta.poly`,
        replication: `${ORIGIN}/replication/africa/spain/ceuta/minute/`,
      },
      replication: { available: true, intervals: ["minute"] },
    });
    expect(ceuta.sizeBytes).toBeGreaterThan(0);
    expect(data.extracts.find((e) => e.id === "north-america/canada/quebec")!.name).toBe("Quebec");
    expect(data.extracts.find((e) => e.id === "africa")!.parentKey).toBeNull();
    expect(data.geometries.get("osmfr:north-america/canada/quebec")!.type).toBe("MultiPolygon");
    expect(data.fetchedAt).toBe("2026-11-06T12:00:00.000Z");

    expect(logger.find("1 extracts have no .poly: africa/spain/melilla")).toHaveLength(1);
    expect(logger.find("1 polygons have no extract: africa/algeria")).toHaveLength(1);
    // merge/ is listed in extracts/ but never requested (the MockAgent would reject it).
  });
});

describe("fetchOsmfr on synthetic listings", () => {
  function site(options: { replication?: Record<string, Row[]> } = {}) {
    serveListing("/extracts/", [["a/"], ["merge/"], ...pbf("a", "311M")]);
    serveListing("/extracts/a/", [["b/"], ["x/"], ...pbf("b"), ...pbf("c")]);
    serveListing("/extracts/a/b/", pbf("d"));
    serveListing("/extracts/a/x/", pbf("y"));
    serveListing("/polygons/", [["a/"], ["a.poly"]]);
    serveListing("/polygons/a/", [["b/"], ["x/"], ["b.poly"], ["c.poly"]]);
    serveListing("/polygons/a/b/", [["d.poly"]]);
    serveListing("/polygons/a/x/", [["y.poly"]]);
    const repl = options.replication ?? {};
    serveListing("/replication/", [["a/"], ["bbox/"], ["planet/"]]);
    serveListing("/replication/a/", [["minute/"], ["b/"], ["c/"], ["x/"], ...(repl["a"] ?? [])]);
    serveListing("/replication/a/b/", repl["a/b"] ?? [["minute/"], ["d/"]]);
    serveListing("/replication/a/c/", repl["a/c"] ?? [["minute/"]]);
    serveListing("/replication/a/b/d/", [["minute/"]]);
    serveListing("/replication/a/x/", [["y/"]]);
    serveListing("/replication/a/x/y/", [["minute/"]]);
    for (const p of ["a", "a/b", "a/c", "a/b/d", "a/x/y"]) servePoly(`/polygons/${p}.poly`);
  }

  it("reads sizes, skips merge/ and the -latest copies, and links parents through directories", async () => {
    const { run } = setup();
    site();
    const data = await run();
    expect(data.extracts.map((e) => [e.id, e.parentKey])).toEqual([
      ["a", null],
      ["a/b", "osmfr:a"],
      ["a/b/d", "osmfr:a/b"],
      ["a/c", "osmfr:a"],
      ["a/x/y", "osmfr:a"],
    ]);
    expect(data.extracts[0]!.sizeBytes).toBe(311 * 1024 ** 2);
  });

  it("detects replication intervals, in minute/hour/day order", async () => {
    const { run } = setup();
    site({
      replication: {
        "a/b": [["day/"], ["hour/"], ["d/"]],
        "a/c": [["state.txt"]],
      },
    });
    const data = await run();
    const repl = (id: string) => data.extracts.find((e) => e.id === id)!;
    expect(repl("a/b").replication).toEqual({ available: true, intervals: ["hour", "day"] });
    expect(repl("a/b").urls.replication).toBe(`${ORIGIN}/replication/a/b/hour/`);
    expect(repl("a/c").replication).toEqual({ available: false, intervals: [] });
    expect(repl("a/c").urls.replication).toBeNull();
    expect(repl("a").replication.intervals).toEqual(["minute"]);
  });

  it("leaves out excluded paths and everything under them, without listing them", async () => {
    const { run } = setup();
    serveListing("/extracts/", [["a/"], ...pbf("a")]);
    serveListing("/extracts/a/", [["b/"], ...pbf("b"), ...pbf("c")]);
    serveListing("/polygons/", [["a/"], ["a.poly"]]);
    serveListing("/polygons/a/", [["b/"], ["b.poly"], ["c.poly"]]);
    serveListing("/replication/", [["a/"]]);
    serveListing("/replication/a/", [["b/"], ["c/"]]);
    serveListing("/replication/a/c/", [["minute/"]]);
    servePoly("/polygons/a.poly");
    servePoly("/polygons/a/c.poly");
    const data = await run({ exclude: ["a/b"] });
    expect(data.extracts.map((e) => e.id)).toEqual(["a", "a/c"]);
  });

  it("skips an extract with a bad .poly and re-parents its children", async () => {
    const { run, logger } = setup();
    serveListing("/extracts/", [["a/"], ...pbf("a")]);
    serveListing("/extracts/a/", [["b/"], ...pbf("b")]);
    serveListing("/extracts/a/b/", pbf("d"));
    serveListing("/polygons/", [["a/"], ["a.poly"]]);
    serveListing("/polygons/a/", [["b/"], ["b.poly"]]);
    serveListing("/polygons/a/b/", [["d.poly"]]);
    serveListing("/replication/", []);
    servePoly("/polygons/a.poly");
    servePoly("/polygons/a/b.poly", "x\n1\n 0 zero\nEND\nEND\n");
    servePoly("/polygons/a/b/d.poly");
    const data = await run();
    expect(data.extracts.map((e) => [e.id, e.parentKey])).toEqual([
      ["a", null],
      ["a/b/d", "osmfr:a"],
    ]);
    expect(logger.find("skipped a/b: Could not parse .poly")).toHaveLength(1);
    expect(logger.find("1 extracts skipped for a bad .poly")).toHaveLength(1);
  });

  it("re-fetches a .poly only when the listing shows a newer date", async () => {
    const { run, clock } = setup();
    const lastModified = "Thu, 05 Nov 2026 01:41:30 GMT";
    serveListing("/extracts/", pbf("a"), 3);
    serveListing("/replication/", [], 3);
    serveListing("/polygons/", [["a.poly", "50", "05-Nov-2026 01:41"]], 2);
    servePoly("/polygons/a.poly", SQUARE, { "last-modified": lastModified });

    await run();
    clock.advance(1000);
    // Same listing date: served from cache, no request (the MockAgent has no second reply).
    expect((await run()).extracts).toHaveLength(1);

    serveListing("/polygons/", [["a.poly", "50", "06-Nov-2026 09:00"]]);
    servePoly("/polygons/a.poly", "x\n1\n 0 0\n 2 0\n 2 2\nEND\nEND\n");
    const data = await run();
    expect(data.geometries.get("osmfr:a")!.coordinates[0]).toContainEqual([2, 2]);
  });

  it("re-fetches a .poly when its listing date can't be read", async () => {
    const { run } = setup();
    serveListing("/extracts/", pbf("a"), 2);
    serveListing("/replication/", [], 2);
    serveListing("/polygons/", [["a.poly", "50", "05-Foo-2026 01:41"]], 2);
    servePoly("/polygons/a.poly", SQUARE, { "last-modified": "Thu, 05 Nov 2026 01:41:30 GMT" });
    servePoly("/polygons/a.poly", SQUARE);
    await run();
    await run();
  });

  it("stops on a listing error", async () => {
    const { run } = setup();
    pool().intercept({ path: "/extracts/" }).reply(403, "");
    await expect(run()).rejects.toThrow(HttpError);
  });

  it("stops on a 5xx without retrying", async () => {
    const { run } = setup();
    pool().intercept({ path: "/extracts/" }).reply(503, "");
    await expect(run()).rejects.toMatchObject({ code: "server-error" });
  });

  it("stops on a .poly error", async () => {
    const { run } = setup();
    serveListing("/extracts/", pbf("a"));
    serveListing("/polygons/", [["a.poly"]]);
    serveListing("/replication/", []);
    pool().intercept({ path: "/polygons/a.poly" }).reply(404, "");
    await expect(run()).rejects.toThrow(/Expected 200, got 404/);
  });

  it("stops on a listing it can't parse", async () => {
    const { run } = setup();
    pool().intercept({ path: "/extracts/" }).reply(200, "<html>maintenance</html>");
    await expect(run()).rejects.toThrow(ListingParseError);
  });
});
