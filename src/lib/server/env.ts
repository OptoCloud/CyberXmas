// The Worker's bindings, secrets and variables, typed to the surface this app uses.
// Keep in sync with wrangler.jsonc (bindings), docs/INFRASTRUCTURE.md (secrets) and
// #lib/config (variables).

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null | undefined>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/** Workers Rate Limiting binding. */
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Workers AI binding. */
export interface Ai {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** Workers Analytics Engine dataset binding. */
export interface AnalyticsEngineDataset {
  writeDataPoint(point: { blobs?: (string | null)[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface Bindings {
  DB: D1Database;
  AI?: Ai;
  TIP_LIMIT?: RateLimit;
  REVIEW_LIMIT?: RateLimit;
  METRICS?: AnalyticsEngineDataset;
}

export interface Secrets {
  EDITOR_TOKEN?: string;
  GITHUB_CLIENT_SECRET?: string;
  TURNSTILE_SECRET?: string;
}

/** Public identifiers that are configured like variables but belong to an integration. */
export interface IntegrationVariables {
  GITHUB_CLIENT_ID?: string;
  TURNSTILE_SITE_KEY?: string;
}

export interface Env extends Bindings, Secrets, IntegrationVariables {
  /** Variables parsed by #lib/config. */
  [variable: string]: unknown;
}

export interface ScheduledController {
  cron: string;
  scheduledTime: number;
}
