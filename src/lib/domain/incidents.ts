import { defaults } from '#lib/config/defaults.ts';

export const categories = {
  vulnerability: 'Vulnerability',
  attack: 'Cyberattack',
  outage: 'Outage',
  breach: 'Data breach',
  research: 'Research'
} as const;

export type Category = keyof typeof categories;

export const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && Object.hasOwn(categories, value);

export const pageSize = defaults.feed.pageSize;

export interface FeedFilters {
  category: Category | '';
  query: string;
  page: number;
}

export function feedFilters(params: URLSearchParams, { maxQueryLength, maxPage } = defaults.feed): FeedFilters {
  const category = params.get('category');
  const page = Number(params.get('page') ?? 1);
  return {
    category: isCategory(category) ? category : '',
    query: (params.get('q') ?? '').trim().slice(0, maxQueryLength),
    page: Number.isSafeInteger(page) && page > 0 && page <= maxPage ? page : 1
  };
}

/** A published report as returned by the public API. */
export interface PublicIncident {
  id: number;
  category: Category;
  title: string;
  summary: string;
  takeaway: string;
  cvss: number | null;
  historical: number;
  occurredAt: string | null;
  sourceUrl: string;
  publishedAt: string;
  year?: number | null;
  day?: number | null;
}

export interface Edition {
  year: number;
  today: string;
  timezone: string;
  calendar: PublicIncident[];
  feed: PublicIncident[];
  years: number[];
  /** Days the edition clock runs ahead of real time; non-zero only on preview deployments. */
  shiftDays: number;
  /** Preview deployments: visitors may pick the edition date. */
  timeTravel: boolean;
}

export interface FeedPage<T> {
  items: T[];
  page: number;
  hasMore: boolean;
}

export const severityLabels = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', none: 'None' } as const;
export type Severity = keyof typeof severityLabels;

/** CVSS v3/v4 qualitative severity rating for a base score. */
export function severity(cvss: number): Severity {
  if (cvss >= 9) return 'critical';
  if (cvss >= 7) return 'high';
  if (cvss >= 4) return 'medium';
  return cvss > 0 ? 'low' : 'none';
}
