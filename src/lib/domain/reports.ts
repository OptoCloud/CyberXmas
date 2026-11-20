import { defaults } from '#lib/config/defaults.ts';
import { isBoundedText, isIsoDay, isRecord, parseHttpsUrl } from '#lib/util/validate.ts';
import { isCategory, type Category } from './incidents.ts';

/** A validated editorial report, ready to store. */
export interface ReportInput {
  category: Category;
  title: string;
  summary: string;
  takeaway: string;
  sourceUrl: string;
  occurredAt: string | null;
  historical: boolean;
  cvss: number | null;
}

/** Validate an editor-submitted report. Returns null when any field is invalid. */
export function parseReport(data: unknown, limits = defaults.editorial.reportMax): ReportInput | null {
  if (!isRecord(data)) return null;
  const { category, title, summary, takeaway, sourceUrl, occurredAt, historical, cvss } = data;
  if (!isCategory(category) || !isBoundedText(title, limits.title) || !isBoundedText(summary, limits.summary)
    || !isBoundedText(takeaway, limits.takeaway) || !isBoundedText(sourceUrl, limits.sourceUrl)
    || typeof historical !== 'boolean') return null;
  if (cvss != null && (category !== 'vulnerability' || typeof cvss !== 'number' || cvss < 0 || cvss > 10)) return null;
  if (occurredAt && !isIsoDay(occurredAt)) return null;
  if (historical && !occurredAt) return null;
  const source = parseHttpsUrl(sourceUrl);
  if (!source) return null;
  return {
    category, title: title.trim(), summary: summary.trim(), takeaway: takeaway.trim(), sourceUrl: source.href,
    occurredAt: (occurredAt as string) || null, historical, cvss: (cvss as number | null | undefined) ?? null
  };
}
