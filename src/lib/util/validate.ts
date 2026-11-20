// Input validation shared by the Worker and the UI.

/** A non-blank string no longer than `limit` characters. */
export const isBoundedText = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.trim() !== '' && value.length <= limit;

/** Parse an HTTPS URL without embedded credentials, or return null. */
export function parseHttpsUrl(value: unknown, { allowPort = true } = {}): URL | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || (!allowPort && url.port)) return null;
  return url;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/** Normalize a parseable timestamp to ISO 8601 UTC, or return ''. */
export function toIsoTimestamp(value: unknown): string {
  const timestamp = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

export const isPositiveId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A positive integer written in canonical decimal form (e.g. a route segment), or null. */
export function parsePositiveId(text: string): number | null {
  if (!/^[1-9]\d*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) ? id : null;
}
