// Public API responses are the same for everyone, so they are cached at Cloudflare's edge and in
// browsers for a short while. That keeps a burst of readers from reaching D1 on every page view.
// A response is never kept past the edition's next midnight, when a new door opens, and an
// editorial write clears the responses readers usually load, so a published report shows up at once.
// Each handler names its own cache key from the parameters it actually reads, so junk query strings
// cannot create new entries or force a database read.
// The Cache API only works on a custom domain; on workers.dev every request renders.
import { zonedMidnight } from '#lib/util/time.ts';
import type { Context } from '../context.ts';

type EdgeCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
  delete(key: Request): Promise<boolean>;
};

const edgeCache = (): EdgeCache | undefined => (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Seconds until the edition clock reaches its next midnight. */
export function secondsUntilNextDoor(ctx: Pick<Context, 'clock' | 'config'>): number {
  const midnight = zonedMidnight(nextDay(ctx.clock.today), ctx.config.edition.timezone).getTime();
  return Math.max(0, Math.floor((midnight - Date.parse(ctx.clock.timestamp)) / 1000));
}

function withCacheControl(response: Response, seconds: number, status?: string): Response {
  const copy = new Response(response.body, response);
  copy.headers.set('Cache-Control', seconds > 0 ? `public, max-age=${seconds}` : 'no-store');
  if (status) copy.headers.set('X-Edge-Cache', status);
  return copy;
}

/**
 * Serve a GET from the edge cache, or render it and store a successful result. `path` is the
 * canonical path and query for this response. `browser: false` keeps it out of browser caches,
 * for responses that differ once the visitor signs in.
 */
export async function cachedPublic(request: Request, ctx: Context, path: string, render: () => Promise<Response>, { browser: inBrowser = true } = {}): Promise<Response> {
  const left = secondsUntilNextDoor(ctx);
  const edge = Math.min(ctx.config.cache.edgeSeconds, left);
  const browser = inBrowser ? Math.min(ctx.config.cache.browserSeconds, left) : 0;
  // A preview with time travel answers differently per visitor, so it is never cached.
  if (request.method !== 'GET' || edge < 1 || ctx.config.edition.timeTravel) return render();

  const cache = edgeCache();
  const key = new Request(new URL(request.url).origin + path, { method: 'GET' });
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) return withCacheControl(hit, browser, 'HIT');

  const response = await render();
  if (response.status !== 200) return response;
  if (cache) ctx.waitUntil(cache.put(key, withCacheControl(response.clone(), edge)).catch(() => {}));
  return withCacheControl(response, browser, cache ? 'MISS' : undefined);
}

/**
 * Clear the cached responses an editorial write is most likely to change: this year's edition,
 * the unfiltered first feed page, the first page of the tip board and the report itself. Filtered
 * and older pages expire on their own within PUBLIC_CACHE_SECONDS. The Cache API clears only the
 * data centre the editor reached. The paths must match the keys the handlers pass to cachedPublic.
 */
export async function purgePublic(request: Request, ctx: Context, reportId?: number): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  const origin = new URL(request.url).origin;
  const paths = [`/api/edition?year=${ctx.clock.year}`, '/api/incidents?q=&category=&page=1', '/api/tips?page=1'];
  if (reportId != null) paths.push(`/api/incidents/${reportId}`);
  await Promise.all(paths.map((path) => cache.delete(new Request(origin + path, { method: 'GET' })).catch(() => false)));
}
