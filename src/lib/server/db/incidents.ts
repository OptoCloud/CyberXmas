// incidents, calendar_entries and editorial_events.
// Publication rule, enforced in SQL for every public read: a report is visible once its
// published_at has passed AND, if it holds a door, once that door's date has arrived.
import type { FeedFilters, PublicIncident } from '#lib/domain/incidents.ts';
import type { EditionClock } from '#lib/domain/edition.ts';
import type { ReportInput } from '#lib/domain/reports.ts';
import type { D1Database, D1PreparedStatement } from '../env.ts';

const columns = `i.id, i.category, i.title, i.summary, i.takeaway, i.cvss,
  i.historical, i.occurred_at AS occurredAt, i.source_url AS sourceUrl, i.published_at AS publishedAt`;
const from = 'FROM incidents i LEFT JOIN calendar_entries c ON c.incident_id = i.id';
const visible = `julianday(i.published_at) <= julianday(?1)
  AND (c.day IS NULL OR printf('%04d-12-%02d', c.year, c.day) <= ?2)`;
const recent = 'ORDER BY julianday(i.published_at) DESC, i.id DESC';

export async function findPublishedIncident(db: D1Database, clock: EditionClock, id: number): Promise<PublicIncident | null> {
  return await db.prepare(`SELECT ${columns}, c.year, c.day ${from} WHERE ${visible} AND i.id = ?3`)
    .bind(clock.timestamp, clock.today, id).first<PublicIncident>() ?? null;
}

/** One page of the feed, fetching one extra row to tell whether another page exists. */
export async function listPublishedIncidents(db: D1Database, clock: EditionClock, filters: FeedFilters, pageSize: number) {
  const { results } = await db.prepare(`
    SELECT ${columns} ${from} WHERE ${visible}
      AND (?3 = '' OR i.category = ?3)
      AND (?4 = '' OR instr(lower(i.title || ' ' || i.summary), lower(?4)) > 0)
    ${recent} LIMIT ?5 OFFSET ?6
  `).bind(clock.timestamp, clock.today, filters.category, filters.query, pageSize + 1, (filters.page - 1) * pageSize)
    .all<PublicIncident>();
  return { items: results.slice(0, pageSize), hasMore: results.length > pageSize };
}

export async function readEdition(db: D1Database, clock: EditionClock, year: number, latestCount: number) {
  const [calendar, editions, feed] = await db.batch([
    db.prepare(`SELECT ${columns}, c.day ${from} WHERE ${visible} AND c.year = ?3 ORDER BY c.day`)
      .bind(clock.timestamp, clock.today, year),
    db.prepare(`SELECT DISTINCT c.year ${from} WHERE ${visible} AND c.year IS NOT NULL ORDER BY c.year DESC`)
      .bind(clock.timestamp, clock.today),
    db.prepare(`SELECT ${columns} ${from} WHERE ${visible} ${recent} LIMIT ?3`)
      .bind(clock.timestamp, clock.today, latestCount)
  ]);
  return {
    calendar: calendar!.results as unknown as PublicIncident[],
    years: (editions!.results as { year: number }[]).map((entry) => entry.year),
    feed: feed!.results as unknown as PublicIncident[]
  };
}

// Editorial reads (batched by the editorial queue).

export const reportQueue = (db: D1Database, limit: number): D1PreparedStatement =>
  db.prepare(`SELECT i.*, c.year, c.day FROM incidents i LEFT JOIN calendar_entries c ON c.incident_id = i.id
    ORDER BY (i.published_at IS NOT NULL), i.id DESC LIMIT ?`).bind(limit);

export const auditTrail = (db: D1Database, limit: number): D1PreparedStatement =>
  db.prepare('SELECT * FROM editorial_events ORDER BY id DESC LIMIT ?').bind(limit);

// Editorial writes. Each returns null/false when the precondition no longer holds.

const reportValues = (report: ReportInput) => [report.category, report.title, report.summary, report.takeaway,
  report.sourceUrl, report.occurredAt, Number(report.historical), report.cvss];
const insertColumns = 'INSERT INTO incidents (category, title, summary, takeaway, source_url, occurred_at, historical, cvss)';

type Id = { id: number };

export async function createReport(db: D1Database, report: ReportInput): Promise<Id | null> {
  return await db.prepare(`${insertColumns} VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(...reportValues(report)).first<Id>() ?? null;
}

export async function updateReport(db: D1Database, id: number, report: ReportInput): Promise<Id | null> {
  return await db.prepare(`UPDATE incidents SET category = ?, title = ?, summary = ?, takeaway = ?,
    source_url = ?, occurred_at = ?, historical = ?, cvss = ? WHERE id = ? RETURNING id`)
    .bind(...reportValues(report), id).first<Id>() ?? null;
}

/** Draft a report from a pending community tip and mark the tip reviewed, atomically. */
export async function createReportFromTip(db: D1Database, report: ReportInput, tipId: number): Promise<Id | null> {
  const [saved] = await db.batch<Id>([
    db.prepare(`${insertColumns} SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM community_tips
      WHERE id = ? AND review_status = 'pending' RETURNING id`).bind(...reportValues(report), tipId),
    db.prepare("UPDATE community_tips SET review_status = 'reviewed' WHERE id = ? AND review_status = 'pending'").bind(tipId)
  ]);
  return saved!.results[0] ?? null;
}

/** Draft a report from a pending imported candidate and mark it reviewed, atomically. */
export async function createReportFromCandidate(db: D1Database, report: ReportInput, provider: string, externalId: string): Promise<Id | null> {
  const [saved] = await db.batch<Id>([
    db.prepare(`${insertColumns} SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM editorial_candidates
      WHERE provider = ? AND external_id = ? AND review_status = 'pending' RETURNING id`)
      .bind(...reportValues(report), provider, externalId),
    db.prepare(`UPDATE editorial_candidates SET review_status = 'reviewed'
      WHERE provider = ? AND external_id = ? AND review_status = 'pending'`).bind(provider, externalId)
  ]);
  return saved!.results[0] ?? null;
}

/** Assign an unscheduled draft to a free door and embargo it until `publishedAt`. */
export async function scheduleReport(db: D1Database, id: number, year: number, day: number, publishedAt: string): Promise<boolean> {
  const [assigned] = await db.batch([
    db.prepare(`INSERT INTO calendar_entries (year, day, incident_id)
      SELECT ?, ?, id FROM incidents WHERE id = ? AND published_at IS NULL
      ON CONFLICT DO NOTHING RETURNING incident_id`).bind(year, day, id),
    db.prepare(`UPDATE incidents SET published_at = ?
      WHERE id = ? AND published_at IS NULL AND EXISTS (
        SELECT 1 FROM calendar_entries WHERE year = ? AND day = ? AND incident_id = ?
      )`).bind(publishedAt, id, year, day, id)
  ]);
  return assigned!.results.length > 0;
}

/** Publish an unscheduled draft to the feed now. */
export async function publishReport(db: D1Database, id: number, timestamp: string): Promise<boolean> {
  const published = await db.prepare(`UPDATE incidents SET published_at = ? WHERE id = ? AND published_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM calendar_entries WHERE incident_id = ?) RETURNING id`).bind(timestamp, id, id).first();
  return Boolean(published);
}

/** Unpublish a report and free its door. */
export async function withdrawReport(db: D1Database, id: number): Promise<boolean> {
  const [, withdrawn] = await db.batch([
    db.prepare('DELETE FROM calendar_entries WHERE incident_id IN (SELECT id FROM incidents WHERE id = ? AND published_at IS NOT NULL)').bind(id),
    db.prepare('UPDATE incidents SET published_at = NULL WHERE id = ? AND published_at IS NOT NULL RETURNING id').bind(id)
  ]);
  return withdrawn!.results.length > 0;
}
