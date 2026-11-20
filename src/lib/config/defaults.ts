// Every tunable value in one place. Code reads `Config`, never literals.
// Values here are the defaults; the Worker variables listed in ./index.ts override some of them.

export const collectorSourceIds = ['cloudflare', 'github', 'cisa'] as const;
export type CollectorSourceId = (typeof collectorSourceIds)[number];

export const editorialAuthModes = ['token', 'access', 'access_and_token'] as const;
export type EditorialAuthMode = (typeof editorialAuthModes)[number];

export interface Config {
  edition: {
    /** IANA zone that defines when a door's day begins. */
    timezone: string;
    /** Oldest edition year the API will serve. */
    firstYear: number;
    /** Stories in the edition response's "latest" strip. */
    latestCount: number;
    /** Preview deployments only: run the edition clock this many days ahead. 0 in production. */
    shiftDays: number;
    /** Preview deployments only: let each visitor pick the edition date with a cookie. */
    timeTravel: boolean;
  };
  /** false asks search engines not to index the site (preview deployments). */
  searchIndexing: boolean;
  /** Public, read-only API responses. Never cached past the next door's midnight. */
  cache: { edgeSeconds: number; browserSeconds: number };
  feed: { pageSize: number; maxQueryLength: number; maxPage: number };
  http: {
    /** Sent on every outbound request. */
    userAgent: string;
    /** Default outbound request timeout. */
    timeoutMs: number;
    /** Maximum accepted JSON request body. */
    maxBodyBytes: number;
  };
  community: {
    sessionSeconds: number;
    oauthFlowSeconds: number;
    turnstileAction: string;
    tipTitleMax: number;
    tipSummaryMax: number;
  };
  editorial: {
    auth: EditorialAuthMode;
    minTokenLength: number;
    reportMax: { title: number; summary: number; takeaway: number; sourceUrl: number };
    queue: { reports: number; candidates: number; audit: number; tips: number };
  };
  access: {
    /** e.g. `example.cloudflareaccess.com`. Empty disables Access verification. */
    teamDomain: string;
    /** Application Audience (AUD) tag from the Access application. */
    audience: string;
    /** How long verified signing keys are reused. */
    certsTtlSeconds: number;
    clockSkewSeconds: number;
  };
  collection: {
    sources: CollectorSourceId[];
    maxCandidatesPerSource: number;
    maxFeedBytes: number;
    timeoutMs: number;
  };
  aiReview: {
    enabled: boolean;
    model: string;
    maxTips: number;
    maxCandidates: number;
    lookbackDays: number;
    maxRecommendations: number;
    maxTokens: number;
  };
  /** Cron expressions; each must also appear in wrangler.jsonc `triggers.crons`. */
  schedule: { collect: string; aiReview: string };
}

export const defaults: Config = {
  edition: { timezone: 'UTC', firstYear: 2000, latestCount: 4, shiftDays: 0, timeTravel: false },
  searchIndexing: true,
  cache: { edgeSeconds: 60, browserSeconds: 30 },
  feed: { pageSize: 12, maxQueryLength: 100, maxPage: 10000 },
  http: { userAgent: 'CyberXmas', timeoutMs: 7000, maxBodyBytes: 32 * 1024 },
  community: {
    sessionSeconds: 7 * 24 * 60 * 60,
    oauthFlowSeconds: 600,
    turnstileAction: 'incident_tip',
    tipTitleMax: 250,
    tipSummaryMax: 1500
  },
  editorial: {
    auth: 'token',
    minTokenLength: 32,
    reportMax: { title: 250, summary: 3000, takeaway: 1500, sourceUrl: 2048 },
    queue: { reports: 100, candidates: 50, audit: 30, tips: 50 }
  },
  access: { teamDomain: '', audience: '', certsTtlSeconds: 3600, clockSkewSeconds: 60 },
  collection: {
    sources: [...collectorSourceIds],
    maxCandidatesPerSource: 50,
    maxFeedBytes: 4 * 1024 * 1024,
    timeoutMs: 10000
  },
  aiReview: {
    enabled: false,
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    maxTips: 40,
    maxCandidates: 60,
    lookbackDays: 3,
    maxRecommendations: 5,
    maxTokens: 1200
  },
  schedule: { collect: '0 * * * *', aiReview: '15 6 * * *' }
};
