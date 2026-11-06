import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ListingParseError, parseListing, parseListingDate, parseSize, resolveListingHref } from "./listing.ts";

const PREFIXES = ["/extracts/", "/polygons/", "/replication/"];
const DIR = "https://download.openstreetmap.fr/extracts/africa/";

function page(title: string, rows: string[]): string {
  return `<html>
<head><title>Index of ${title}</title></head>
<body>
<h1>Index of ${title}</h1><hr><pre><a href="../">../</a>
${rows.join("\n")}
</pre><hr></body>
</html>
`;
}

const row = (href: string, date: string, size: string) =>
  `<a href="${href}">${href.slice(0, 50)}</a>                                        ${date}    ${size}`;

function makeLogger() {
  const lines: string[] = [];
  return { info: (m: string) => lines.push(m), warn: (m: string) => lines.push(m), lines };
}

describe("parseSize", () => {
  it.each([
    ["56", 56],
    ["222K", 222 * 1024],
    ["311M", 311 * 1024 ** 2],
    ["8G", 8 * 1024 ** 3],
    ["1T", 1024 ** 4],
    ["1.5K", 1536],
  ])("%s → %i", (text, bytes) => expect(parseSize(text)).toBe(bytes));

  it.each(["-", "", "12X", "M"])("%j → null", (text) => expect(parseSize(text)).toBeNull());
});

describe("parseListingDate", () => {
  it("parses nginx dates as UTC", () => {
    expect(parseListingDate("05-Nov-2026 01:41")).toBe("2026-11-05T01:41:00Z");
  });
  it.each(["5-Nov-2026 01:41", "05-Foo-2026 01:41", "garbage"])("%j → null", (text) => {
    expect(parseListingDate(text)).toBeNull();
  });
});

describe("resolveListingHref", () => {
  it.each([
    ["algeria.osm.pbf", `${DIR}algeria.osm.pbf`],
    ["mozambique/", `${DIR}mozambique/`],
    ["c%C3%B4te.poly", `${DIR}c%C3%B4te.poly`],
  ])("accepts %s", (href, expected) => {
    expect(resolveListingHref(href, DIR, PREFIXES)?.href).toBe(expected);
  });

  it.each([
    ["an absolute off-origin URL", "https://evil.example.com/extracts/africa/x"],
    ["a protocol-relative URL", "//evil.example.com/x"],
    ["http on the same host", "http://download.openstreetmap.fr/extracts/africa/x"],
    ["the parent", "../"],
    ["the directory itself", "./"],
    ["an encoded parent", "%2e%2e/%2e%2e/etc"],
    ["an encoded slash parent", "..%2fsecret"],
    ["an encoded dot segment", "x%2f.%2fy"],
    ["a backslash", "x%5Cy"],
    ["a NUL byte", "x%00y"],
    ["bad percent-encoding", "x%E0%A4%A"],
    ["a query string", "x.pbf?y=1"],
    ["a fragment", "x.pbf#y"],
    ["an absolute path outside the prefixes", "/private/x"],
    ["a sibling directory", "/extracts/asia/x"],
    ["a nested path", "a/b.pbf"],
    ["an unparseable URL", "https://[bad"],
    ["javascript:", "javascript:alert(1)"],
  ])("rejects %s", (_label, href) => {
    expect(resolveListingHref(href, DIR, PREFIXES)).toBeNull();
  });

  it("rejects a directory outside the allowed prefixes", () => {
    expect(resolveListingHref("x", "https://download.openstreetmap.fr/other/", PREFIXES)).toBeNull();
  });
});

describe("parseListing", () => {
  it("parses files and directories", () => {
    const html = page("/extracts/africa/", [
      row("mozambique/", "09-Sep-2026 10:33", "-"),
      row("algeria.osm.pbf", "05-Nov-2026 01:41", "311M"),
      row("algeria.osm.pbf.md5", "05-Nov-2026 01:41", "50"),
      row("caf&amp;e.poly", "05-Nov-2026 01:41", "2K"),
    ]);
    const entries = parseListing(html, DIR, PREFIXES, makeLogger());
    expect(entries).toEqual([
      { name: "mozambique", url: `${DIR}mozambique/`, isDir: true, modifiedAt: "2026-09-09T10:33:00Z", sizeBytes: null, sizeText: "-" },
      { name: "algeria.osm.pbf", url: `${DIR}algeria.osm.pbf`, isDir: false, modifiedAt: "2026-11-05T01:41:00Z", sizeBytes: 311 * 1024 ** 2, sizeText: "311M" },
      { name: "algeria.osm.pbf.md5", url: `${DIR}algeria.osm.pbf.md5`, isDir: false, modifiedAt: "2026-11-05T01:41:00Z", sizeBytes: 50, sizeText: "50" },
      { name: "caf&e.poly", url: `${DIR}caf&e.poly`, isDir: false, modifiedAt: "2026-11-05T01:41:00Z", sizeBytes: 2048, sizeText: "2K" },
    ]);
  });

  it("decodes percent-encoded names", () => {
    const html = page("/extracts/africa/", [row("c%C3%B4te_d%27ivoire.osm.pbf", "05-Nov-2026 01:41", "1M")]);
    expect(parseListing(html, DIR, PREFIXES, makeLogger())[0]!.name).toBe("côte_d'ivoire.osm.pbf");
  });

  it("returns an empty list for an empty directory", () => {
    expect(parseListing(page("/extracts/africa/", []), DIR, PREFIXES, makeLogger())).toEqual([]);
  });

  it("skips and logs unsafe hrefs", () => {
    const logger = makeLogger();
    const html = page("/extracts/africa/", [
      row("https://evil.example.com/x", "05-Nov-2026 01:41", "1M"),
      row("%2e%2e/%2e%2e/etc/passwd", "05-Nov-2026 01:41", "1M"),
      row("ok.osm.pbf", "05-Nov-2026 01:41", "1M"),
    ]);
    const entries = parseListing(html, DIR, PREFIXES, logger);
    expect(entries.map((e) => e.name)).toEqual(["ok.osm.pbf"]);
    expect(logger.lines).toHaveLength(2);
    expect(logger.lines[0]).toContain("evil.example.com");
  });

  it.each([
    ["a directory URL without a trailing slash", page("/extracts/africa/", []), "https://download.openstreetmap.fr/extracts/africa", "must end with /"],
    ["a page without the heading", "<html><body>Hello</body></html>", DIR, "no 'Index of' heading"],
    ["a heading for another directory", page("/extracts/asia/", []), DIR, "heading is for /extracts/asia/"],
    ["no <pre> block", "<h1>Index of /extracts/africa/</h1><p>nope</p>", DIR, "no <pre> block"],
    ["no parent link", "<h1>Index of /extracts/africa/</h1><pre></pre>", DIR, "no parent link"],
    ["a row in an unexpected format", page("/extracts/africa/", ['<a href="x.pbf">x.pbf</a> yesterday 3M']), DIR, "1 rows in an unexpected format"],
  ])("fails clearly on %s", (_label, html, dir, message) => {
    expect(() => parseListing(html, dir, PREFIXES, makeLogger())).toThrow(ListingParseError);
    expect(() => parseListing(html, dir, PREFIXES, makeLogger())).toThrow(message);
  });
});

describe("recorded OSM-FR listings", () => {
  const files = readdirSync("fixtures/osmfr", { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith("index.html"))
    .sort();

  it("has fixtures to test", () => expect(files.length).toBeGreaterThan(5));

  it.each(files)("parses %s with no skipped entries", (file) => {
    const dir = `https://download.openstreetmap.fr/${file.slice(0, -"index.html".length)}`;
    const logger = makeLogger();
    const entries = parseListing(readFileSync(`fixtures/osmfr/${file}`, "utf8"), dir, PREFIXES, logger);
    expect(entries.length).toBeGreaterThan(0);
    expect(logger.lines).toEqual([]);
    for (const e of entries) {
      expect(e.modifiedAt).not.toBeNull();
      expect(e.sizeBytes === null).toBe(e.isDir);
    }
  });
});
