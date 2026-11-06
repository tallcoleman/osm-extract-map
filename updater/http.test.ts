import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMockAgent } from "../test/mock-agent.ts";
import { checkAllowedUrl } from "../shared/urls.ts";
import {
  cacheKey,
  HttpClient,
  type HttpClientOptions,
  HttpError,
  parseRetryAfter,
} from "./http.ts";

const HOST = "download.example.org";
const ORIGIN = `https://${HOST}`;
const OTHER_HOST = "mirror.example.org";
const UA = "osm-extract-map/1.2.3 (+https://github.com/tallcoleman/osm-extract-map)";

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "http-test-"));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function makeClock(start = 1_700_000_000_000) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

function makeLogger() {
  const lines: string[] = [];
  return {
    info: (m: string) => lines.push(`info: ${m}`),
    warn: (m: string) => lines.push(`warn: ${m}`),
    lines,
  };
}

function makeClient(overrides: Partial<HttpClientOptions> = {}) {
  const clock = makeClock();
  const logger = makeLogger();
  const client = new HttpClient({
    cacheDir,
    allowedHosts: [HOST, OTHER_HOST],
    userAgent: UA,
    now: clock.now,
    sleep: clock.sleep,
    logger,
    ...overrides,
  });
  return { client, clock, logger };
}

function pool(origin = ORIGIN) {
  return getMockAgent().get(origin);
}

async function expectHttpError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((e) => e instanceof HttpError && e.code === code);
}

describe("checkAllowedUrl", () => {
  it.each([
    ["https://download.example.org/a", true],
    ["http://download.example.org/a", false],
    ["https://evil.example.com/a", false],
    ["https://download.example.org.evil.com/a", false],
    ["https://user:pw@download.example.org/a", false],
    ["https://download.example.org:8443/a", false],
    ["javascript:alert(1)", false],
    ["data:text/html,hi", false],
    ["not a url", false],
  ])("%s → %s", (url, ok) => {
    expect(checkAllowedUrl(url, [HOST]) !== null).toBe(ok);
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  it("parses seconds", () => expect(parseRetryAfter(" 7 ", now)).toBe(7000));
  it("parses an HTTP-date", () => expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000));
  it("clamps a past date to zero", () => expect(parseRetryAfter("Wed, 31 Dec 2025 00:00:00 GMT", now)).toBe(0));
  it("returns null for missing or invalid values", () => {
    expect(parseRetryAfter(undefined, now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});

describe("HttpClient", () => {
  it("sends the exact User-Agent", async () => {
    let seen: unknown;
    pool()
      .intercept({ path: "/a" })
      .reply((opts) => {
        seen = (opts.headers as Record<string, string>)["user-agent"];
        return { statusCode: 200, data: "ok" };
      });
    const { client } = makeClient();
    await client.get(`${ORIGIN}/a`);
    expect(seen).toBe(UA);
  });

  it("spaces requests by the minimum interval", async () => {
    const { client, clock } = makeClient({ minIntervalMs: 1500 });
    const times: number[] = [];
    pool()
      .intercept({ path: /\/n\d/ })
      .reply(() => {
        times.push(clock.now());
        return { statusCode: 200, data: "x" };
      })
      .times(3);
    await client.get(`${ORIGIN}/n1`);
    await client.get(`${ORIGIN}/n2`);
    clock.advance(400);
    await client.get(`${ORIGIN}/n3`);
    expect(times[1]! - times[0]!).toBe(1500);
    expect(times[2]! - times[1]!).toBe(1500);
    expect(clock.sleeps).toEqual([1500, 1100]);
  });

  it("defaults to a 1s interval", async () => {
    const { client, clock } = makeClient();
    pool().intercept({ path: /\/d\d/ }).reply(200, "x").times(2);
    await client.get(`${ORIGIN}/d1`);
    await client.get(`${ORIGIN}/d2`);
    expect(clock.sleeps).toEqual([1000]);
  });

  it("keeps only one request in flight", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fakeFetch = (async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response("x", { status: 200 });
    }) as unknown as HttpClientOptions["fetch"];
    const { client } = makeClient({ fetch: fakeFetch, minIntervalMs: 0 });
    await Promise.all([1, 2, 3].map((n) => client.get(`${ORIGIN}/p${n}`)));
    expect(maxInFlight).toBe(1);
  });

  it("keeps the queue going after a failed request", async () => {
    const { client } = makeClient({ maxRetries: 0 });
    pool().intercept({ path: "/fail" }).replyWithError(new Error("boom"));
    pool().intercept({ path: "/ok" }).reply(200, "fine");
    const results = await Promise.allSettled([client.get(`${ORIGIN}/fail`), client.get(`${ORIGIN}/ok`)]);
    expect(results[0]!.status).toBe("rejected");
    expect(results[1]!.status).toBe("fulfilled");
  });

  describe("caching and conditional requests", () => {
    it("caches a response with an ETag and revalidates with If-None-Match", async () => {
      const { client } = makeClient();
      pool()
        .intercept({ path: "/e" })
        .reply(200, "body-1", { headers: { etag: '"v1"', "last-modified": "Mon, 01 Jan 2024 00:00:00 GMT" } });
      const first = await client.get(`${ORIGIN}/e`);
      expect(first.source).toBe("network");
      expect(first.body.toString()).toBe("body-1");

      let conditional: Record<string, string> = {};
      pool()
        .intercept({ path: "/e" })
        .reply((opts) => {
          conditional = opts.headers as Record<string, string>;
          return { statusCode: 304, data: "" };
        });
      const second = await client.get(`${ORIGIN}/e`);
      expect(conditional["if-none-match"]).toBe('"v1"');
      expect(conditional["if-modified-since"]).toBe("Mon, 01 Jan 2024 00:00:00 GMT");
      expect(second.source).toBe("revalidated");
      expect(second.status).toBe(200);
      expect(second.body.toString()).toBe("body-1");
      expect(client.getStats().notModified).toBe(1);
    });

    it("sends only If-Modified-Since when there is no ETag", async () => {
      const { client } = makeClient();
      pool()
        .intercept({ path: "/lm" })
        .reply(200, "a", { headers: { "last-modified": "Mon, 01 Jan 2024 00:00:00 GMT" } });
      await client.get(`${ORIGIN}/lm`);
      let headers: Record<string, string> = {};
      pool()
        .intercept({ path: "/lm" })
        .reply((opts) => {
          headers = opts.headers as Record<string, string>;
          return { statusCode: 200, data: "b", responseOptions: { headers: { etag: '"x"' } } };
        });
      const res = await client.get(`${ORIGIN}/lm`);
      expect(headers["if-none-match"]).toBeUndefined();
      expect(headers["if-modified-since"]).toBeDefined();
      expect(res.body.toString()).toBe("b");
    });

    it("does not cache responses without validators in online mode", async () => {
      const { client } = makeClient();
      pool().intercept({ path: "/nv" }).reply(200, "x").times(2);
      await client.get(`${ORIGIN}/nv`);
      expect(await readdir(cacheDir).catch(() => [])).toEqual([]);
      const again = await client.get(`${ORIGIN}/nv`);
      expect(again.source).toBe("network");
    });

    it("does not send conditional headers for a cached non-200 response", async () => {
      const { client } = makeClient({ mode: "record" });
      pool()
        .intercept({ path: "/gone" })
        .reply(404, "nope", { headers: { etag: '"404"' } });
      await client.get(`${ORIGIN}/gone`);
      let headers: Record<string, string> = {};
      pool()
        .intercept({ path: "/gone" })
        .reply((opts) => {
          headers = opts.headers as Record<string, string>;
          return { statusCode: 404, data: "nope" };
        });
      await client.get(`${ORIGIN}/gone`);
      expect(headers["if-none-match"]).toBeUndefined();
    });

    it("fails on a 304 that was not asked for", async () => {
      const { client } = makeClient();
      pool().intercept({ path: "/304" }).reply(304, "");
      await expectHttpError(client.get(`${ORIGIN}/304`), "unexpected-304");
    });

    it("fails on a 304 when the cached entry had no validators", async () => {
      const { client } = makeClient({ mode: "record" });
      pool().intercept({ path: "/r304" }).reply(200, "x");
      await client.get(`${ORIGIN}/r304`);
      pool().intercept({ path: "/r304" }).reply(304, "");
      await expectHttpError(client.get(`${ORIGIN}/r304`), "unexpected-304");
    });

    it("serves fresh entries without a request when freshForMs is set", async () => {
      const { client, clock } = makeClient({ mode: "record", freshForMs: 60_000 });
      pool().intercept({ path: "/f" }).reply(200, "x");
      await client.get(`${ORIGIN}/f`);
      clock.advance(30_000);
      const res = await client.get(`${ORIGIN}/f`);
      expect(res.source).toBe("cache");
      expect(client.getStats()).toMatchObject({ requests: 1, cacheHits: 1 });

      clock.advance(31_000);
      pool().intercept({ path: "/f" }).reply(200, "y");
      expect((await client.get(`${ORIGIN}/f`)).body.toString()).toBe("y");
    });

    it("reports when each response was fetched or revalidated", async () => {
      const { client, clock } = makeClient();
      const start = clock.now();
      pool().intercept({ path: "/t" }).reply(200, "x", { headers: { etag: '"1"' } });
      expect((await client.get(`${ORIGIN}/t`)).fetchedAt).toBe(start);
      clock.advance(5000);
      pool().intercept({ path: "/t" }).reply(304, "");
      expect((await client.get(`${ORIGIN}/t`)).fetchedAt).toBe(start + 5000);
    });

    describe("reuseIfNotModifiedSince", () => {
      const lastModified = "Fri, 06 Nov 2026 10:00:00 GMT";
      const at = Date.parse(lastModified);

      async function primed() {
        const made = makeClient();
        pool().intercept({ path: "/p.poly" }).reply(200, "old", { headers: { "last-modified": lastModified } });
        await made.client.get(`${ORIGIN}/p.poly`);
        return made;
      }

      it("serves the cached copy with no request when it is at least as new", async () => {
        const { client } = await primed();
        for (const since of [at, at - 60_000]) {
          const res = await client.get(`${ORIGIN}/p.poly`, { reuseIfNotModifiedSince: since });
          expect(res.source).toBe("cache");
          expect(res.body.toString()).toBe("old");
        }
        expect(client.getStats()).toMatchObject({ requests: 1, cacheHits: 2 });
      });

      it("requests the file when the listing shows a newer date", async () => {
        const { client } = await primed();
        pool().intercept({ path: "/p.poly" }).reply(200, "new");
        const res = await client.get(`${ORIGIN}/p.poly`, { reuseIfNotModifiedSince: at + 60_000 });
        expect(res.body.toString()).toBe("new");
      });

      it("requests the file when the cached copy has no Last-Modified", async () => {
        const { client } = makeClient({ mode: "record" });
        pool().intercept({ path: "/q.poly" }).reply(200, "a");
        await client.get(`${ORIGIN}/q.poly`);
        pool().intercept({ path: "/q.poly" }).reply(200, "b");
        expect((await client.get(`${ORIGIN}/q.poly`, { reuseIfNotModifiedSince: 0 })).body.toString()).toBe("b");
      });

      it("never reuses a cached error response", async () => {
        const { client } = makeClient({ mode: "record" });
        pool().intercept({ path: "/r.poly" }).reply(404, "", { headers: { "last-modified": lastModified } });
        await client.get(`${ORIGIN}/r.poly`);
        pool().intercept({ path: "/r.poly" }).reply(200, "ok");
        expect((await client.get(`${ORIGIN}/r.poly`, { reuseIfNotModifiedSince: 0 })).status).toBe(200);
      });
    });

    it("ignores unreadable or outdated cache entries", async () => {
      const url = `${ORIGIN}/bad-cache`;
      const key = cacheKey("GET", url);
      await writeFile(path.join(cacheDir, `${key}.json`), "{not json");
      const { client } = makeClient();
      pool().intercept({ path: "/bad-cache" }).reply(200, "a");
      expect((await client.get(url)).source).toBe("network");

      await writeFile(path.join(cacheDir, `${key}.json`), JSON.stringify({ version: 0 }));
      pool().intercept({ path: "/bad-cache" }).reply(200, "b");
      expect((await client.get(url)).source).toBe("network");

      await writeFile(path.join(cacheDir, `${key}.json`), JSON.stringify({ version: 1 }));
      pool().intercept({ path: "/bad-cache" }).reply(200, "c");
      expect((await client.get(url)).source).toBe("network");
    });

    it("names cache files by hash, so ../ in URLs cannot escape the cache dir", async () => {
      const inner = path.join(cacheDir, "inner");
      const { client } = makeClient({ cacheDir: inner, mode: "record" });
      pool()
        .intercept({ path: /.*/ })
        .reply(200, "x")
        .times(3);
      await client.get(`${ORIGIN}/a/../../../escape`);
      await client.get(`${ORIGIN}/a/%2e%2e/%2e%2e/escape`);
      await client.get(`${ORIGIN}/a/..%2f..%2fescape`);
      expect(await readdir(cacheDir)).toEqual(["inner"]);
      const files = await readdir(inner);
      // The first two normalize to the same URL ("/escape"), so 2 entries × 2 files.
      expect(files.length).toBe(4);
      for (const f of files) expect(f).toMatch(/^[0-9a-f]{64}\.(json|body)$/);
    });
  });

  describe("modes", () => {
    it("offline mode serves from cache and fails on a miss", async () => {
      const recorder = makeClient({ mode: "record" }).client;
      pool().intercept({ path: "/o" }).reply(200, "cached");
      await recorder.get(`${ORIGIN}/o`);

      const { client } = makeClient({ mode: "offline" });
      const res = await client.get(`${ORIGIN}/o`);
      expect(res.source).toBe("cache");
      expect(res.body.toString()).toBe("cached");
      await expectHttpError(client.get(`${ORIGIN}/missing`), "offline-miss");
      await expectHttpError(client.head(`${ORIGIN}/o`), "offline-miss");
      expect(client.getStats().requests).toBe(0);
    });

    it("record mode caches responses without validators, HEADs and 404s", async () => {
      const { client } = makeClient({ mode: "record" });
      pool().intercept({ path: "/plain" }).reply(200, "p");
      pool().intercept({ path: "/size", method: "HEAD" }).reply(200, "", { headers: { "content-length": "1234" } });
      pool().intercept({ path: "/404" }).reply(404, "nf");
      await client.get(`${ORIGIN}/plain`);
      await client.head(`${ORIGIN}/size`);
      await client.get(`${ORIGIN}/404`);

      const offline = makeClient({ mode: "offline" }).client;
      expect((await offline.get(`${ORIGIN}/plain`)).body.toString()).toBe("p");
      const head = await offline.head(`${ORIGIN}/size`);
      expect(head.headers["content-length"]).toBe("1234");
      expect(head.body.length).toBe(0);
      expect((await offline.get(`${ORIGIN}/404`)).status).toBe(404);
    });
  });

  describe("HEAD and redirects", () => {
    it("follows redirects on HEAD and reports the final URL", async () => {
      const { client } = makeClient();
      pool()
        .intercept({ path: "/latest.pbf", method: "HEAD" })
        .reply(302, "", { headers: { location: "/files/v2.pbf" } });
      pool()
        .intercept({ path: "/files/v2.pbf", method: "HEAD" })
        .reply(200, "", { headers: { "content-length": "999" } });
      const res = await client.head(`${ORIGIN}/latest.pbf`);
      expect(res.finalUrl).toBe(`${ORIGIN}/files/v2.pbf`);
      expect(res.headers["content-length"]).toBe("999");
    });

    it("leaves content-length absent when the server omits it", async () => {
      const fakeFetch = (async () =>
        new Response(null, { status: 200 })) as unknown as HttpClientOptions["fetch"];
      const { client } = makeClient({ fetch: fakeFetch });
      const res = await client.head(`${ORIGIN}/nolen`);
      expect(res.headers["content-length"]).toBeUndefined();
    });

    it("follows redirects to another allowlisted host", async () => {
      const { client } = makeClient();
      pool().intercept({ path: "/x" }).reply(301, "", { headers: { location: `https://${OTHER_HOST}/x` } });
      pool(`https://${OTHER_HOST}`).intercept({ path: "/x" }).reply(200, "there");
      expect((await client.get(`${ORIGIN}/x`)).body.toString()).toBe("there");
    });

    it.each([
      ["an off-allowlist host", "https://evil.example.com/x"],
      ["http:", `http://${HOST}/x`],
    ])("refuses a redirect to %s", async (_label, location) => {
      const { client, logger } = makeClient();
      pool().intercept({ path: "/r" }).reply(302, "", { headers: { location } });
      await expectHttpError(client.get(`${ORIGIN}/r`), "refused");
      expect(logger.lines.some((l) => l.startsWith("warn: Refused"))).toBe(true);
    });

    it("allows 5 redirects and fails on the 6th", async () => {
      const { client } = makeClient();
      for (let i = 0; i < 5; i++) {
        pool().intercept({ path: `/h${i}` }).reply(302, "", { headers: { location: `/h${i + 1}` } });
      }
      pool().intercept({ path: "/h5" }).reply(200, "done");
      expect((await client.get(`${ORIGIN}/h0`)).body.toString()).toBe("done");

      for (let i = 0; i < 6; i++) {
        pool().intercept({ path: `/k${i}` }).reply(302, "", { headers: { location: `/k${i + 1}` } });
      }
      await expectHttpError(client.get(`${ORIGIN}/k0`), "too-many-redirects");
    });

    it("fails on a redirect without a Location or with an unparseable one", async () => {
      const { client } = makeClient();
      pool().intercept({ path: "/noloc" }).reply(302, "");
      await expectHttpError(client.get(`${ORIGIN}/noloc`), "bad-redirect");
      pool().intercept({ path: "/badloc" }).reply(302, "", { headers: { location: "https://[bad" } });
      await expectHttpError(client.get(`${ORIGIN}/badloc`), "bad-redirect");
    });
  });

  describe("allowlist", () => {
    it.each(["http://download.example.org/a", "https://evil.example.com/a", "file:///etc/passwd"])(
      "refuses %s without any request",
      async (url) => {
        const { client } = makeClient();
        await expectHttpError(client.get(url), "refused");
        expect(client.getStats().requests).toBe(0);
      },
    );
  });

  describe("retries", () => {
    it("retries 5xx with exponential backoff, then succeeds", async () => {
      const { client, clock } = makeClient({ minIntervalMs: 0, retryBaseMs: 100 });
      pool().intercept({ path: "/s" }).reply(500, "e").times(2);
      pool().intercept({ path: "/s" }).reply(200, "ok");
      expect((await client.get(`${ORIGIN}/s`)).body.toString()).toBe("ok");
      expect(clock.sleeps).toEqual([100, 200]);
      expect(client.getStats().retries).toBe(2);
    });

    it("gives up after the retry limit on 5xx", async () => {
      const { client } = makeClient({ minIntervalMs: 0, maxRetries: 2 });
      pool().intercept({ path: "/s" }).reply(502, "e").times(3);
      await expectHttpError(client.get(`${ORIGIN}/s`), "server-error");
      expect(client.getStats().requests).toBe(3);
    });

    it("retries network errors, then gives up", async () => {
      const { client, clock } = makeClient({ minIntervalMs: 0, maxRetries: 2, retryBaseMs: 10 });
      pool().intercept({ path: "/n" }).replyWithError(new Error("reset")).times(3);
      await expectHttpError(client.get(`${ORIGIN}/n`), "network");
      expect(clock.sleeps).toEqual([10, 20]);
    });

    it("honours Retry-After in seconds on 429", async () => {
      const { client, clock } = makeClient({ minIntervalMs: 0 });
      pool().intercept({ path: "/rl" }).reply(429, "", { headers: { "retry-after": "12" } });
      pool().intercept({ path: "/rl" }).reply(200, "ok");
      await client.get(`${ORIGIN}/rl`);
      expect(clock.sleeps).toEqual([12_000]);
    });

    it("honours Retry-After as an HTTP-date on 503", async () => {
      const { client, clock } = makeClient({ minIntervalMs: 0 });
      const at = new Date(clock.now() + 20_000).toUTCString();
      pool().intercept({ path: "/u" }).reply(503, "", { headers: { "retry-after": at } });
      pool().intercept({ path: "/u" }).reply(200, "ok");
      await client.get(`${ORIGIN}/u`);
      expect(clock.sleeps).toEqual([20_000]);
    });

    it("falls back to backoff on 429 without Retry-After", async () => {
      const { client, clock } = makeClient({ minIntervalMs: 0, retryBaseMs: 50 });
      pool().intercept({ path: "/rl2" }).reply(429, "");
      pool().intercept({ path: "/rl2" }).reply(200, "ok");
      await client.get(`${ORIGIN}/rl2`);
      expect(clock.sleeps).toEqual([50]);
    });

    it("ignores Retry-After on other 5xx statuses", async () => {
      const { client, clock } = makeClient({ minIntervalMs: 0, retryBaseMs: 50 });
      pool().intercept({ path: "/500" }).reply(500, "", { headers: { "retry-after": "999" } });
      pool().intercept({ path: "/500" }).reply(200, "ok");
      await client.get(`${ORIGIN}/500`);
      expect(clock.sleeps).toEqual([50]);
    });

    it("fails instead of waiting for a very long Retry-After", async () => {
      const { client } = makeClient({ minIntervalMs: 0, maxRetryAfterMs: 60_000 });
      pool().intercept({ path: "/long" }).reply(429, "", { headers: { "retry-after": "3600" } });
      await expectHttpError(client.get(`${ORIGIN}/long`), "retry-after-too-long");
    });

    it.each([400, 403, 404, 410])("does not retry %i", async (status) => {
      const { client } = makeClient();
      pool().intercept({ path: "/c" }).reply(status, "");
      const res = await client.get(`${ORIGIN}/c`);
      expect(res.status).toBe(status);
      expect(client.getStats()).toMatchObject({ requests: 1, retries: 0 });
    });
  });

  describe("getText", () => {
    it("returns the body for a 200", async () => {
      const { client } = makeClient();
      pool().intercept({ path: "/t" }).reply(200, "héllo");
      expect(await client.getText(`${ORIGIN}/t`)).toBe("héllo");
    });

    it("throws for other statuses", async () => {
      const { client } = makeClient();
      pool().intercept({ path: "/t" }).reply(404, "");
      await expectHttpError(client.getText(`${ORIGIN}/t`), "bad-status");
    });
  });

  it("logs a summary of requests and bytes", async () => {
    const { client, logger } = makeClient();
    pool().intercept({ path: "/sum" }).reply(200, "12345");
    await client.get(`${ORIGIN}/sum`);
    client.logSummary();
    expect(logger.lines.at(-1)).toBe(
      "info: HTTP: 1 requests, 5 bytes received, 0 not modified, 0 served from cache, 0 retries",
    );
  });

  it("uses real defaults for clock, sleep and logger", async () => {
    // Long enough that the second request always has to wait, so the real sleep runs.
    const client = new HttpClient({ cacheDir, allowedHosts: [HOST], userAgent: UA, minIntervalMs: 50 });
    pool().intercept({ path: /\/def\d/ }).reply(200, "x").times(2);
    await client.get(`${ORIGIN}/def1`);
    await client.get(`${ORIGIN}/def2`);
    expect(client.getStats().requests).toBe(2);
  });

  it("writes cache files atomically, leaving no temp files", async () => {
    const { client } = makeClient({ mode: "record" });
    pool().intercept({ path: "/atomic" }).reply(200, "x");
    await client.get(`${ORIGIN}/atomic`);
    const files = await readdir(cacheDir);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
    const meta = JSON.parse(await readFile(path.join(cacheDir, files.find((f) => f.endsWith(".json"))!), "utf8"));
    expect(meta).toMatchObject({ version: 1, method: "GET", url: `${ORIGIN}/atomic`, status: 200 });
  });
});
