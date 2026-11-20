// One Context per request or scheduled run. Handlers receive everything through it:
// validated config, bindings, outbound clients, metrics and the edition clock.
import { loadConfig, type Config } from '#lib/config/index.ts';
import { editionClock, type EditionClock } from '#lib/domain/edition.ts';
import { zonedDay } from '#lib/util/time.ts';
import { createMetrics, type Metrics } from './clients/cloudflare/analytics.ts';
import { createHttpClient, type Fetch, type HttpClient } from './clients/http.ts';
import type { D1Database, Env } from './env.ts';

export interface ContextOptions {
  /** Override the current time (tests, scheduled runs). */
  now?: Date;
  /** Override outbound fetch (tests). */
  fetch?: Fetch;
  /** Keep the request alive for background work, such as a cache write. */
  waitUntil?: (promise: Promise<unknown>) => void;
  /** The visitor's chosen edition date (YYYY-MM-DD). Ignored unless EDITION_TIME_TRAVEL is on. */
  editionDate?: string;
}

/** Which optional capabilities are fully configured. A missing piece disables the feature. */
export interface Features {
  signIn: boolean;
  tipSubmission: boolean;
  tipReview: boolean;
  aiReview: boolean;
  editorToken: boolean;
  access: boolean;
}

export interface Context {
  env: Env;
  config: Readonly<Config>;
  features: Features;
  db: D1Database;
  http: HttpClient;
  metrics: Metrics;
  now: Date;
  /** The edition's clock: `now`, moved by `shiftDays` on preview deployments. */
  clock: EditionClock;
  /** Whole days the edition clock runs ahead of real time (negative runs behind). 0 in production. */
  shiftDays: number;
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * The part of SvelteKit's RequestEvent that endpoint logic uses. `src/hooks.server.ts` puts the
 * Context on `locals`; tests pass these three fields directly.
 */
export interface ApiEvent<Params extends Record<string, unknown> = Record<string, never>> {
  request: Request;
  params: Params;
  locals: { ctx: Context };
}

export type ApiHandler<Params extends Record<string, unknown> = Record<string, never>> =
  (event: ApiEvent<Params>) => Promise<Response>;

const loaded = new WeakMap<object, Readonly<Config>>();

/** Parse config once per env object and report invalid variables once. */
function configFor(env: Env): Readonly<Config> {
  let config = loaded.get(env);
  if (!config) {
    const result = loadConfig(env);
    for (const problem of result.problems) console.warn(`Ignoring invalid variable ${problem}`);
    config = result.config;
    loaded.set(env, config);
  }
  return config;
}

export function features(env: Env, config: Readonly<Config>): Features {
  const signIn = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
  return {
    signIn,
    tipSubmission: Boolean(signIn && env.TIP_LIMIT && env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY),
    tipReview: Boolean(signIn && env.REVIEW_LIMIT),
    aiReview: Boolean(config.aiReview.enabled && env.AI),
    editorToken: (env.EDITOR_TOKEN?.length ?? 0) >= config.editorial.minTokenLength,
    access: Boolean(config.access.teamDomain && config.access.audience)
  };
}

const settle = (promise: Promise<unknown>) => { promise.catch(() => {}); };

/** Preview time travel: whole days from today to the chosen date, or null when it is not usable. */
export function travelDays(chosen: string | undefined, now: Date, config: Readonly<Config>): number | null {
  if (!config.edition.timeTravel || !chosen || !/^\d{4}-\d{2}-\d{2}$/.test(chosen)) return null;
  const target = Date.parse(`${chosen}T00:00:00Z`);
  if (Number.isNaN(target) || new Date(target).toISOString().slice(0, 10) !== chosen) return null;
  const days = Math.round((target - Date.parse(`${zonedDay(now, config.edition.timezone)}T00:00:00Z`)) / 86400000);
  return Math.abs(days) <= 400 ? days : null;
}

export function createContext(env: Env, { now = new Date(), fetch: fetchImpl = fetch, waitUntil = settle, editionDate }: ContextOptions = {}): Context {
  const config = configFor(env);
  const shiftDays = travelDays(editionDate, now, config) ?? config.edition.shiftDays;
  const editionNow = new Date(now.getTime() + shiftDays * 86400000);
  return {
    env,
    config,
    features: features(env, config),
    db: env.DB,
    http: createHttpClient(fetchImpl, config.http),
    metrics: createMetrics(env.METRICS),
    now,
    clock: editionClock(editionNow, config.edition.timezone),
    shiftDays,
    waitUntil
  };
}
