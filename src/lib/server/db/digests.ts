// editorial_ai_digests: one daily AI shortlist per UTC day.
import type { Digest, ShortlistEntry } from '#lib/domain/editorial.ts';
import type { D1Database, D1PreparedStatement } from '../env.ts';

export type { Digest, ShortlistEntry };

/** Claim today's run. Returns false if another run already claimed it. */
export async function claimDigest(db: D1Database, day: string, tipCount: number, candidateCount: number, startedAt: string): Promise<boolean> {
  const claimed = await db.prepare(`INSERT INTO editorial_ai_digests (day, status, tip_count, candidate_count, started_at)
    VALUES (?, 'running', ?, ?, ?) ON CONFLICT DO NOTHING RETURNING day`).bind(day, tipCount, candidateCount, startedAt).first();
  return Boolean(claimed);
}

/**
 * Let the desk rerun a day's review: drop that day's finished or failed digest. A running one is
 * dropped only if it started before `staleBefore`, which means its Worker died without finishing.
 */
export async function releaseDigest(db: D1Database, day: string, staleBefore: string): Promise<void> {
  await db.prepare(`DELETE FROM editorial_ai_digests WHERE day = ?
    AND (status != 'running' OR started_at IS NULL OR started_at < ?)`).bind(day, staleBefore).run();
}

/** Store the shortlist together with any extra statements (e.g. marking tips reviewed), atomically. */
export async function completeDigest(db: D1Database, day: string, shortlist: ShortlistEntry[], also: D1PreparedStatement[] = []): Promise<void> {
  await db.batch([
    db.prepare("UPDATE editorial_ai_digests SET status = 'ready', shortlist = ? WHERE day = ?").bind(JSON.stringify(shortlist), day),
    ...also
  ]);
}

export async function failDigest(db: D1Database, day: string): Promise<void> {
  await db.prepare("UPDATE editorial_ai_digests SET status = 'failed' WHERE day = ?").bind(day).run();
}

export const latestDigest = (db: D1Database): D1PreparedStatement =>
  db.prepare('SELECT day, status, tip_count AS tipCount, candidate_count AS candidateCount, shortlist FROM editorial_ai_digests ORDER BY day DESC LIMIT 1');

export function parseDigest(row: Record<string, unknown> | undefined): Digest | null {
  return row ? { ...(row as unknown as Digest), shortlist: JSON.parse(row.shortlist as string) as ShortlistEntry[] } : null;
}
