// Turn Worker variables into a validated, immutable Config.
// Secrets and bindings are not config: they are read from `env` by the server context.
import { isTimeZone } from '#lib/util/time.ts';
import {
  collectorSourceIds, defaults, editorialAuthModes,
  type CollectorSourceId, type Config, type EditorialAuthMode
} from './defaults.ts';

export { defaults, collectorSourceIds, editorialAuthModes };
export type { Config, CollectorSourceId, EditorialAuthMode };

type Setter = (config: Config, raw: string) => string | void;

export interface Variable {
  name: string;
  description: string;
  set: Setter;
}

const integer = (min: number, max: number, assign: (config: Config, value: number) => void): Setter =>
  (config, raw) => {
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < min || value > max) return `expected an integer from ${min} to ${max}`;
    assign(config, value);
  };

const cron = (assign: (config: Config, value: string) => void): Setter => (config, raw) => {
  const fields = raw.trim().split(/\s+/);
  if (fields.length !== 5 || !fields.every((field) => /^[\d*/,\-A-Za-z]+$/.test(field))) return 'expected a 5-field cron expression';
  assign(config, fields.join(' '));
};

/** Every Worker variable the application reads, in documentation order. */
export const variables: Variable[] = [
  {
    name: 'EDITION_TIMEZONE',
    description: 'IANA time zone in which each December door opens at midnight.',
    set: (config, raw) => {
      if (!isTimeZone(raw)) return 'expected an IANA time zone such as UTC or Europe/Oslo';
      config.edition.timezone = raw;
    }
  },
  {
    name: 'EDITORIAL_AUTH',
    description: 'How editors authenticate: token, access, or access_and_token.',
    set: (config, raw) => {
      if (!(editorialAuthModes as readonly string[]).includes(raw)) return `expected one of ${editorialAuthModes.join(', ')}`;
      config.editorial.auth = raw as EditorialAuthMode;
    }
  },
  {
    name: 'ACCESS_TEAM_DOMAIN',
    description: 'Cloudflare Access team domain, e.g. example.cloudflareaccess.com.',
    set: (config, raw) => {
      const domain = raw.trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '');
      if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain)) return 'expected <team>.cloudflareaccess.com';
      config.access.teamDomain = domain;
    }
  },
  {
    name: 'ACCESS_AUD',
    description: 'Application Audience (AUD) tag of the Access application protecting the editorial desk.',
    set: (config, raw) => {
      if (!/^[\w-]{16,128}$/.test(raw.trim())) return 'expected the AUD tag from the Access application';
      config.access.audience = raw.trim();
    }
  },
  {
    name: 'COLLECTOR_SOURCES',
    description: `Comma-separated collectors to run hourly (${collectorSourceIds.join(', ')}). Empty runs none.`,
    set: (config, raw) => {
      const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
      const unknown = ids.filter((id) => !(collectorSourceIds as readonly string[]).includes(id));
      if (unknown.length) return `unknown source ${unknown.join(', ')}`;
      config.collection.sources = [...new Set(ids)] as CollectorSourceId[];
    }
  },
  {
    name: 'COLLECTOR_MAX_CANDIDATES',
    description: 'Most recent candidates stored per source per run.',
    set: integer(1, 500, (config, value) => { config.collection.maxCandidatesPerSource = value; })
  },
  {
    name: 'AI_REVIEW_ENABLED',
    description: 'true to run the daily Workers AI shortlist (requires the AI binding).',
    set: (config, raw) => {
      if (raw !== 'true' && raw !== 'false') return 'expected true or false';
      config.aiReview.enabled = raw === 'true';
    }
  },
  {
    name: 'AI_REVIEW_MODEL',
    description: 'Workers AI model that supports JSON-schema responses.',
    set: (config, raw) => {
      if (!/^@cf\/[\w./-]+$/.test(raw)) return 'expected a Workers AI model name such as @cf/meta/...';
      config.aiReview.model = raw;
    }
  },
  {
    name: 'AI_REVIEW_MAX_TIPS',
    description: 'Untriaged community tips considered per daily review.',
    set: integer(0, 200, (config, value) => { config.aiReview.maxTips = value; })
  },
  {
    name: 'AI_REVIEW_MAX_CANDIDATES',
    description: 'Imported leads considered per daily review.',
    set: integer(0, 200, (config, value) => { config.aiReview.maxCandidates = value; })
  },
  {
    name: 'AI_REVIEW_LOOKBACK_DAYS',
    description: 'How far back imported leads are considered by the daily review.',
    set: integer(1, 30, (config, value) => { config.aiReview.lookbackDays = value; })
  },
  {
    name: 'EDITION_DATE_SHIFT_DAYS',
    description: 'Preview deployments only: run the edition clock this many days ahead, so doors open before December. Leave unset in production.',
    set: integer(0, 366, (config, value) => { config.edition.shiftDays = value; })
  },
  {
    name: 'EDITION_TIME_TRAVEL',
    description: 'Preview deployments only: true lets each visitor pick the edition date (a cookie set from the preview banner). Never set it in production.',
    set: (config, raw) => {
      if (raw !== 'true' && raw !== 'false') return 'expected true or false';
      config.edition.timeTravel = raw === 'true';
    }
  },
  {
    name: 'SEARCH_INDEXING',
    description: 'false serves a disallow-all robots.txt and an X-Robots-Tag: noindex header. Set it on preview deployments.',
    set: (config, raw) => {
      if (raw !== 'true' && raw !== 'false') return 'expected true or false';
      config.searchIndexing = raw === 'true';
    }
  },
  {
    name: 'PUBLIC_CACHE_SECONDS',
    description: 'How long public API responses are cached at the edge. 0 turns edge caching off.',
    set: integer(0, 3600, (config, value) => { config.cache.edgeSeconds = value; })
  },
  {
    name: 'COMMUNITY_SESSION_DAYS',
    description: 'Lifetime of a GitHub sign-in session.',
    set: integer(1, 90, (config, value) => { config.community.sessionSeconds = value * 86400; })
  },
  {
    name: 'CRON_COLLECT',
    description: 'Cron expression that runs source collection. Must match wrangler.jsonc triggers.',
    set: cron((config, value) => { config.schedule.collect = value; })
  },
  {
    name: 'CRON_AI_REVIEW',
    description: 'Cron expression that runs the daily AI review. Must match wrangler.jsonc triggers.',
    set: cron((config, value) => { config.schedule.aiReview = value; })
  }
];

export interface ConfigResult {
  config: Readonly<Config>;
  problems: string[];
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Build Config from Worker variables. Invalid values keep their default and are reported in `problems`. */
export function loadConfig(env: Record<string, unknown> = {}): ConfigResult {
  const config = structuredClone(defaults);
  const problems: string[] = [];
  for (const { name, set } of variables) {
    const raw = env[name];
    if (raw === undefined || (raw === '' && name !== 'COLLECTOR_SOURCES')) continue;
    const problem = typeof raw === 'string' ? set(config, raw) : 'expected a string variable';
    if (problem) problems.push(`${name}: ${problem}`);
  }
  if (config.schedule.collect === config.schedule.aiReview) problems.push('CRON_COLLECT and CRON_AI_REVIEW must differ');
  return { config: deepFreeze(config), problems };
}
