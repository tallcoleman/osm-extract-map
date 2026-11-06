// Rate-limited, caching HTTP client. All provider traffic goes through here.
//
// Cache layout: for each request, `<sha256>.json` holds metadata and
// `<sha256>.body` holds the body. The hash is of "<METHOD> <URL>", so URLs
// never become file paths.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetch as undiciFetch } from "undici";
import { checkAllowedUrl } from "../shared/urls.ts";

export type HttpMode = "online" | "offline" | "record";
export type HttpMethod = "GET" | "HEAD";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export interface HttpClientOptions {
  cacheDir: string;
  allowedHosts: readonly string[];
  userAgent: string;
  /** online (default): conditional requests, caches responses that have validators.
   *  offline: cache only, a miss is an error.
   *  record: online, and caches every response (including HEADs and 404s). */
  mode?: HttpMode;
  /** Minimum gap between the end of one request and the start of the next. */
  minIntervalMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  /** A Retry-After longer than this fails the request instead of waiting. */
  maxRetryAfterMs?: number;
  maxRedirects?: number;
  /** Cached entries younger than this are served without any request.
   *  Lets an interrupted recording crawl resume without repeating requests. */
  freshForMs?: number;
  fetch?: typeof undiciFetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: Logger;
}

export interface HttpResponse {
  url: string;
  finalUrl: string;
  status: number;
  /** Lower-cased names; only the headers in KEPT_HEADERS. */
  headers: Record<string, string>;
  body: Buffer;
  source: "network" | "revalidated" | "cache";
  /** When the body was fetched or last revalidated (ms since epoch). */
  fetchedAt: number;
}

export interface GetOptions {
  /** If the cached copy's Last-Modified is at or after this time (ms since
   *  epoch), return it without any request. Used when a directory listing
   *  already shows the file's modification time. */
  reuseIfNotModifiedSince?: number;
}

export interface HttpStats {
  requests: number;
  bytesReceived: number;
  notModified: number;
  cacheHits: number;
  retries: number;
}

export type HttpErrorCode =
  | "refused"
  | "offline-miss"
  | "too-many-redirects"
  | "bad-redirect"
  | "network"
  | "server-error"
  | "retry-after-too-long"
  | "unexpected-304"
  | "bad-status";

export class HttpError extends Error {
  readonly code: HttpErrorCode;
  readonly url: string;
  readonly status: number | null;

  constructor(code: HttpErrorCode, url: string, message: string, status: number | null = null) {
    super(`${message}: ${url}`);
    this.name = "HttpError";
    this.code = code;
    this.url = url;
    this.status = status;
  }
}

interface CacheMeta {
  version: 1;
  method: HttpMethod;
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  fetchedAt: number;
}

interface RawResponse {
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

const KEPT_HEADERS = ["etag", "last-modified", "content-length", "content-type", "date", "location"] as const;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CACHE_VERSION = 1;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Parses a Retry-After value (seconds or HTTP-date) into milliseconds from now. */
export function parseRetryAfter(value: string | undefined, now: number): number | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

export function cacheKey(method: HttpMethod, url: string): string {
  return createHash("sha256").update(`${method} ${url}`).digest("hex");
}

export class HttpClient {
  private readonly opts: Required<Omit<HttpClientOptions, "fetch" | "now" | "sleep" | "logger">>;
  private readonly fetchImpl: typeof undiciFetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: Logger;
  private queue: Promise<unknown> = Promise.resolve();
  private lastEnd = Number.NEGATIVE_INFINITY;
  private readonly stats: HttpStats = { requests: 0, bytesReceived: 0, notModified: 0, cacheHits: 0, retries: 0 };

  constructor(options: HttpClientOptions) {
    this.opts = {
      cacheDir: options.cacheDir,
      allowedHosts: options.allowedHosts,
      userAgent: options.userAgent,
      mode: options.mode ?? "online",
      minIntervalMs: options.minIntervalMs ?? 1000,
      maxRetries: options.maxRetries ?? 3,
      retryBaseMs: options.retryBaseMs ?? 1000,
      maxRetryAfterMs: options.maxRetryAfterMs ?? 300_000,
      maxRedirects: options.maxRedirects ?? 5,
      freshForMs: options.freshForMs ?? 0,
    };
    this.fetchImpl = options.fetch ?? undiciFetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.logger = options.logger ?? console;
  }

  get(url: string, options: GetOptions = {}): Promise<HttpResponse> {
    return this.request("GET", url, options);
  }

  head(url: string): Promise<HttpResponse> {
    return this.request("HEAD", url);
  }

  /** GET that requires a 200 response and returns the body as text. */
  async getText(url: string): Promise<string> {
    const res = await this.get(url);
    if (res.status !== 200) throw new HttpError("bad-status", url, `Expected 200, got ${res.status}`, res.status);
    return res.body.toString("utf8");
  }

  getStats(): HttpStats {
    return { ...this.stats };
  }

  logSummary(): void {
    const s = this.stats;
    this.logger.info(
      `HTTP: ${s.requests} requests, ${s.bytesReceived} bytes received, ` +
        `${s.notModified} not modified, ${s.cacheHits} served from cache, ${s.retries} retries`,
    );
  }

  async request(method: HttpMethod, url: string, options: GetOptions = {}): Promise<HttpResponse> {
    const parsed = this.requireAllowed(url);
    const href = parsed.href;
    const key = cacheKey(method, href);
    const cached = await this.readCache(key);

    if (this.opts.mode === "offline") {
      if (!cached) throw new HttpError("offline-miss", href, `Not in cache (offline mode), ${method}`);
      this.stats.cacheHits++;
      return toResponse(cached.meta, cached.body, "cache");
    }

    if (cached && this.opts.freshForMs > 0 && this.now() - cached.meta.fetchedAt < this.opts.freshForMs) {
      this.stats.cacheHits++;
      return toResponse(cached.meta, cached.body, "cache");
    }

    if (cached && options.reuseIfNotModifiedSince !== undefined && cached.meta.status === 200) {
      const lastModified = Date.parse(cached.meta.headers["last-modified"] ?? "");
      if (lastModified >= options.reuseIfNotModifiedSince) {
        this.stats.cacheHits++;
        return toResponse(cached.meta, cached.body, "cache");
      }
    }

    const conditional: Record<string, string> = {};
    if (cached && cached.meta.status === 200) {
      if (cached.meta.headers["etag"]) conditional["if-none-match"] = cached.meta.headers["etag"];
      if (cached.meta.headers["last-modified"]) conditional["if-modified-since"] = cached.meta.headers["last-modified"];
    }

    const raw = await this.fetchFollowingRedirects(method, href, conditional);

    if (raw.status === 304) {
      if (!cached || Object.keys(conditional).length === 0) {
        throw new HttpError("unexpected-304", href, "304 without a conditional request", 304);
      }
      this.stats.notModified++;
      const meta: CacheMeta = { ...cached.meta, fetchedAt: this.now() };
      await this.writeMeta(key, meta);
      return toResponse(meta, cached.body, "revalidated");
    }

    const meta: CacheMeta = {
      version: CACHE_VERSION,
      method,
      url: href,
      finalUrl: raw.finalUrl,
      status: raw.status,
      headers: raw.headers,
      fetchedAt: this.now(),
    };
    const hasValidator = raw.headers["etag"] !== undefined || raw.headers["last-modified"] !== undefined;
    if (this.opts.mode === "record" || (raw.status === 200 && hasValidator)) {
      await this.writeCache(key, meta, raw.body);
    }
    return toResponse(meta, raw.body, "network");
  }

  private requireAllowed(url: string): URL {
    const parsed = checkAllowedUrl(url, this.opts.allowedHosts);
    if (!parsed) {
      this.logger.warn(`Refused request to non-allowlisted URL: ${url}`);
      throw new HttpError("refused", url, "URL is not https on an allowlisted host");
    }
    return parsed;
  }

  private async fetchFollowingRedirects(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
  ): Promise<RawResponse> {
    let current = url;
    for (let hop = 0; ; hop++) {
      const res = await this.fetchWithRetry(method, current, headers);
      if (!REDIRECT_STATUSES.has(res.status)) return res;
      const location = res.headers["location"];
      if (!location) throw new HttpError("bad-redirect", current, `Redirect ${res.status} without Location`, res.status);
      if (hop >= this.opts.maxRedirects) {
        throw new HttpError("too-many-redirects", url, `More than ${this.opts.maxRedirects} redirects`);
      }
      let next: string;
      try {
        next = new URL(location, current).href;
      } catch {
        throw new HttpError("bad-redirect", current, `Unparseable Location "${location}"`, res.status);
      }
      current = this.requireAllowed(next).href;
    }
  }

  private async fetchWithRetry(
    method: HttpMethod,
    url: string,
    headers: Record<string, string>,
  ): Promise<RawResponse> {
    for (let attempt = 0; ; attempt++) {
      let raw: RawResponse;
      try {
        raw = await this.schedule(() => this.fetchOnce(method, url, headers));
      } catch (error) {
        if (attempt >= this.opts.maxRetries) {
          throw new HttpError("network", url, `Network error after ${attempt + 1} attempts (${String(error)})`);
        }
        await this.backoff(attempt, url, "network error");
        continue;
      }

      const retryable = raw.status >= 500 || raw.status === 429;
      if (!retryable) return raw;
      if (attempt >= this.opts.maxRetries) {
        throw new HttpError("server-error", url, `Status ${raw.status} after ${attempt + 1} attempts`, raw.status);
      }
      const retryAfter =
        raw.status === 429 || raw.status === 503 ? parseRetryAfter(raw.headers["retry-after"], this.now()) : null;
      if (retryAfter === null) {
        await this.backoff(attempt, url, `status ${raw.status}`);
        continue;
      }
      if (retryAfter > this.opts.maxRetryAfterMs) {
        throw new HttpError("retry-after-too-long", url, `Retry-After of ${retryAfter}ms is too long`, raw.status);
      }
      this.stats.retries++;
      this.logger.warn(`Status ${raw.status}, retrying after ${retryAfter}ms (Retry-After): ${url}`);
      await this.sleep(retryAfter);
    }
  }

  private async backoff(attempt: number, url: string, reason: string): Promise<void> {
    const delay = this.opts.retryBaseMs * 2 ** attempt;
    this.stats.retries++;
    this.logger.warn(`${reason}, retrying in ${delay}ms: ${url}`);
    await this.sleep(delay);
  }

  private async fetchOnce(method: HttpMethod, url: string, extra: Record<string, string>): Promise<RawResponse> {
    this.stats.requests++;
    const res = await this.fetchImpl(url, {
      method,
      redirect: "manual",
      headers: { "user-agent": this.opts.userAgent, ...extra },
    });
    const body = method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
    this.stats.bytesReceived += body.length;
    const kept: Record<string, string> = {};
    for (const name of [...KEPT_HEADERS, "retry-after"]) {
      const value = res.headers.get(name);
      if (value !== null) kept[name] = value;
    }
    return { finalUrl: url, status: res.status, headers: kept, body };
  }

  /** Runs one network request at a time, with at least minIntervalMs between them. */
  private schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const wait = this.lastEnd + this.opts.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      try {
        return await task();
      } finally {
        this.lastEnd = this.now();
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private paths(key: string) {
    return {
      meta: path.join(this.opts.cacheDir, `${key}.json`),
      body: path.join(this.opts.cacheDir, `${key}.body`),
    };
  }

  private async readCache(key: string): Promise<{ meta: CacheMeta; body: Buffer } | null> {
    const p = this.paths(key);
    let meta: CacheMeta;
    try {
      meta = JSON.parse(await readFile(p.meta, "utf8")) as CacheMeta;
    } catch {
      return null;
    }
    if (meta.version !== CACHE_VERSION) return null;
    try {
      return { meta, body: await readFile(p.body) };
    } catch {
      return null;
    }
  }

  private async writeCache(key: string, meta: CacheMeta, body: Buffer): Promise<void> {
    await mkdir(this.opts.cacheDir, { recursive: true });
    const p = this.paths(key);
    await atomicWrite(p.body, body);
    await atomicWrite(p.meta, JSON.stringify(meta));
  }

  private async writeMeta(key: string, meta: CacheMeta): Promise<void> {
    await atomicWrite(this.paths(key).meta, JSON.stringify(meta));
  }
}

async function atomicWrite(file: string, data: string | Buffer): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

function toResponse(meta: CacheMeta, body: Buffer, source: HttpResponse["source"]): HttpResponse {
  return {
    url: meta.url,
    finalUrl: meta.finalUrl,
    status: meta.status,
    headers: { ...meta.headers },
    body,
    source,
    fetchedAt: meta.fetchedAt,
  };
}
