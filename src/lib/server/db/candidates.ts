// editorial_candidates (imported leads) and editorial_source_state (collector health).
// Collector updates never publish anything and never reset an editor's review status.
import type { CandidateLead } from '../clients/leads.ts';
import type { D1Database, D1PreparedStatement } from '../env.ts';

const upsert = `
  INSERT INTO editorial_candidates (
    provider, external_id, title, source_url, impact, provider_status,
    occurred_at, provider_updated_at, first_seen_at, category
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (provider, external_id) DO UPDATE SET
    title = excluded.title, impact = excluded.impact, provider_status = excluded.provider_status,
    occurred_at = excluded.occurred_at, provider_updated_at = excluded.provider_updated_at
  WHERE excluded.provider_updated_at >= editorial_candidates.provider_updated_at
`;

const impactOrder = "CASE impact WHEN 'critical' THEN 0 WHEN 'major' THEN 1 ELSE 2 END";

/** Store a successful collection run: upsert its leads and record source health in one batch. */
export async function recordCollection(db: D1Database, provider: string, leads: CandidateLead[], timestamp: string): Promise<void> {
  await db.batch([
    ...leads.map((lead) => db.prepare(upsert).bind(
      provider, lead.id, lead.title, lead.url, lead.impact, lead.status,
      lead.occurred, lead.updated, timestamp, lead.category
    )),
    db.prepare(`
      INSERT INTO editorial_source_state (provider, attempted_at, succeeded_at, candidate_count)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (provider) DO UPDATE SET
        attempted_at = excluded.attempted_at, succeeded_at = excluded.succeeded_at,
        candidate_count = excluded.candidate_count, last_error = NULL
      WHERE excluded.attempted_at >= editorial_source_state.attempted_at
    `).bind(provider, timestamp, timestamp, leads.length)
  ]);
}

export async function recordCollectionFailure(db: D1Database, provider: string, timestamp: string, message: string): Promise<void> {
  await db.prepare(`
    INSERT INTO editorial_source_state (provider, attempted_at, last_error) VALUES (?, ?, ?)
    ON CONFLICT (provider) DO UPDATE SET
      attempted_at = excluded.attempted_at, last_error = excluded.last_error
    WHERE excluded.attempted_at >= editorial_source_state.attempted_at
  `).bind(provider, timestamp, message).run();
}

export const pendingCandidates = (db: D1Database, limit: number): D1PreparedStatement =>
  db.prepare(`SELECT * FROM editorial_candidates WHERE review_status = 'pending'
    ORDER BY ${impactOrder}, occurred_at DESC LIMIT ?`).bind(limit);

export const sourceStates = (db: D1Database): D1PreparedStatement =>
  db.prepare('SELECT * FROM editorial_source_state ORDER BY provider');

export async function reviewCandidate(db: D1Database, provider: string, externalId: string, status: 'reviewed' | 'dismissed'): Promise<boolean> {
  const updated = await db.prepare(`UPDATE editorial_candidates SET review_status = ?
    WHERE provider = ? AND external_id = ? AND review_status = 'pending' RETURNING external_id`)
    .bind(status, provider, externalId).first();
  return Boolean(updated);
}

export interface CandidateForReview {
  title: string;
  category: string;
  sourceUrl: string;
  kind: string;
  impact: string;
  status: string;
}

/** Recently updated pending leads, most severe first, for the daily AI review. */
export const candidatesForReview = (db: D1Database, since: string, limit: number): D1PreparedStatement =>
  db.prepare(`SELECT title, category, source_url AS sourceUrl, provider AS kind, impact, provider_status AS status
    FROM editorial_candidates WHERE review_status = 'pending' AND provider_updated_at >= ?
    ORDER BY ${impactOrder}, provider_updated_at DESC
    LIMIT ?`).bind(since, limit);
