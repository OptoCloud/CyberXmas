// community_sessions, community_tips and community_tip_likes.
// A tip is public while it is pending and was submitted by a signed-in account.
import type { PublicTip } from '#lib/domain/community.ts';
import type { Category } from '#lib/domain/incidents.ts';
import type { D1Database, D1PreparedStatement } from '../env.ts';

const publicTip = `review_status = 'pending' AND submitter_github_id IS NOT NULL`;
const likeCount = '(SELECT COUNT(*) FROM community_tip_likes WHERE tip_id = t.id)';

export interface Viewer {
  id: number;
  login: string;
}

// Sessions are stored by token hash; the token itself only exists in the browser cookie.

export async function findSession(db: D1Database, tokenHash: string, nowSeconds: number): Promise<Viewer | null> {
  return await db.prepare(`SELECT github_id AS id, login FROM community_sessions s WHERE token_hash = ? AND expires_at > ?
    AND NOT EXISTS (SELECT 1 FROM community_blocks WHERE github_id = s.github_id)`)
    .bind(tokenHash, nowSeconds).first<Viewer>() ?? null;
}

/** Store a session and sweep expired ones. */
export async function createSession(db: D1Database, tokenHash: string, viewer: Viewer, nowSeconds: number, expiresAt: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM community_sessions WHERE expires_at <= ?').bind(nowSeconds),
    db.prepare('INSERT INTO community_sessions (token_hash, github_id, login, expires_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, viewer.id, viewer.login, expiresAt)
  ]);
}

export async function deleteSession(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM community_sessions WHERE token_hash = ?').bind(tokenHash).run();
}

// Public review queue.

export async function listPublicTips(db: D1Database, viewerId: number | null, limit: number, offset: number): Promise<PublicTip[]> {
  const { results } = await db.prepare(`SELECT t.id, t.title, t.summary, t.category, t.source_url AS sourceUrl,
    ${likeCount} AS likes,
    EXISTS (SELECT 1 FROM community_tip_likes WHERE tip_id = t.id AND github_id = ?1) AS liked,
    t.submitter_github_id != ?1 AS canLike
    FROM community_tips t WHERE ${publicTip} ORDER BY likes DESC, t.id DESC LIMIT ?2 OFFSET ?3`)
    .bind(viewerId, limit, offset).all<PublicTip>();
  return results;
}

/** The submitter of a tip that is still in public review, or null. */
export async function findPublicTipAuthor(db: D1Database, id: number): Promise<number | null> {
  const tip = await db.prepare(`SELECT submitter_github_id AS author FROM community_tips WHERE id = ? AND ${publicTip}`)
    .bind(id).first<{ author: number }>();
  return tip?.author ?? null;
}

export async function setTipLike(db: D1Database, tipId: number, viewerId: number, liked: boolean): Promise<void> {
  if (liked) {
    await db.prepare(`INSERT INTO community_tip_likes (tip_id, github_id)
      SELECT id, ? FROM community_tips WHERE id = ? AND ${publicTip} ON CONFLICT DO NOTHING`).bind(viewerId, tipId).run();
  } else {
    await db.prepare('DELETE FROM community_tip_likes WHERE tip_id = ? AND github_id = ?').bind(tipId, viewerId).run();
  }
}

/**
 * Insert a tip unless its canonical source is already pending or became a report. A dismissed tip
 * does not hold its source forever: the new tip takes over that row and starts without likes.
 */
export async function insertTip(db: D1Database, tip: {
  category: Category; title: string; summary: string; sourceUrl: string; submitter: Viewer; submittedAt: string;
}): Promise<{ id: number } | null> {
  const [, saved] = await db.batch<{ id: number }>([
    db.prepare(`DELETE FROM community_tip_likes WHERE tip_id IN
      (SELECT id FROM community_tips WHERE source_url = ? AND review_status = 'dismissed')`).bind(tip.sourceUrl),
    db.prepare(`INSERT INTO community_tips (category, title, summary, source_url, submitter_github_id, submitter_login, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (source_url) DO UPDATE SET
        category = excluded.category, title = excluded.title, summary = excluded.summary,
        submitter_github_id = excluded.submitter_github_id, submitter_login = excluded.submitter_login,
        review_status = 'pending', ai_reviewed_at = NULL, submitted_at = excluded.submitted_at
      WHERE community_tips.review_status = 'dismissed'
      RETURNING id`)
      .bind(tip.category, tip.title, tip.summary, tip.sourceUrl, tip.submitter.id, tip.submitter.login, tip.submittedAt)
  ]);
  return saved!.results[0] ?? null;
}

/** Tips this account has sent since `since` (ISO 8601 UTC), for the daily cap. */
export async function countTipsSince(db: D1Database, submitterId: number, since: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM community_tips WHERE submitter_github_id = ? AND submitted_at >= ?')
    .bind(submitterId, since).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function isBlocked(db: D1Database, githubId: number): Promise<boolean> {
  return Boolean(await db.prepare('SELECT 1 AS blocked FROM community_blocks WHERE github_id = ?').bind(githubId).first());
}

// Editorial use.

export const pendingTips = (db: D1Database, limit: number): D1PreparedStatement =>
  db.prepare(`SELECT t.id, t.title, t.summary, t.category, t.source_url, ${likeCount} AS likes,
    t.submitter_github_id, t.submitter_login
    FROM community_tips t WHERE t.review_status = 'pending' ORDER BY likes DESC, t.id DESC LIMIT ?`).bind(limit);

export async function dismissTip(db: D1Database, id: number): Promise<boolean> {
  const updated = await db.prepare(`UPDATE community_tips SET review_status = 'dismissed'
    WHERE id = ? AND review_status = 'pending' RETURNING id`).bind(id).first();
  return Boolean(updated);
}

/**
 * Block the account that sent a tip: dismiss its pending tips, end its sessions and drop its likes.
 * Returns false when the tip does not exist or has no known submitter.
 */
export async function blockSubmitter(db: D1Database, tipId: number): Promise<boolean> {
  const tip = await db.prepare('SELECT submitter_github_id AS id, submitter_login AS login FROM community_tips WHERE id = ?')
    .bind(tipId).first<{ id: number | null; login: string | null }>();
  if (tip?.id == null) return false;
  await db.batch([
    db.prepare('INSERT INTO community_blocks (github_id, login) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(tip.id, tip.login),
    db.prepare("UPDATE community_tips SET review_status = 'dismissed' WHERE submitter_github_id = ? AND review_status = 'pending'").bind(tip.id),
    db.prepare('DELETE FROM community_sessions WHERE github_id = ?').bind(tip.id),
    db.prepare('DELETE FROM community_tip_likes WHERE github_id = ?').bind(tip.id)
  ]);
  return true;
}

export async function unblockAccount(db: D1Database, githubId: number): Promise<boolean> {
  const removed = await db.prepare('DELETE FROM community_blocks WHERE github_id = ? RETURNING github_id').bind(githubId).first();
  return Boolean(removed);
}

export const blockedAccounts = (db: D1Database, limit: number): D1PreparedStatement =>
  db.prepare('SELECT github_id, login, blocked_at FROM community_blocks ORDER BY blocked_at DESC LIMIT ?').bind(limit);

export interface TipForReview {
  tipId: number;
  title: string;
  category: string;
  sourceUrl: string;
  kind: string;
  likes: number;
}

/** Oldest public tips the daily AI review has not seen yet. */
export const tipsForReview = (db: D1Database, limit: number): D1PreparedStatement =>
  db.prepare(`SELECT t.id AS tipId, t.title, t.category, t.source_url AS sourceUrl, 'community tip' AS kind,
    ${likeCount} AS likes
    FROM community_tips t WHERE t.review_status = 'pending' AND t.submitter_github_id IS NOT NULL
    AND t.ai_reviewed_at IS NULL ORDER BY t.id LIMIT ?`).bind(limit);

export const markTipReviewed = (db: D1Database, tipId: number, timestamp: string): D1PreparedStatement =>
  db.prepare('UPDATE community_tips SET ai_reviewed_at = ? WHERE id = ?').bind(timestamp, tipId);
