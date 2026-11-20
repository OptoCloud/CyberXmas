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
  return await db.prepare('SELECT github_id AS id, login FROM community_sessions WHERE token_hash = ? AND expires_at > ?')
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

/** Insert a tip unless its canonical source was already submitted. */
export async function insertTip(db: D1Database, tip: {
  category: Category; title: string; summary: string; sourceUrl: string; submitter: number;
}): Promise<{ id: number } | null> {
  return await db.prepare(`INSERT INTO community_tips (category, title, summary, source_url, submitter_github_id)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT (source_url) DO NOTHING RETURNING id`)
    .bind(tip.category, tip.title, tip.summary, tip.sourceUrl, tip.submitter).first<{ id: number }>() ?? null;
}

// Editorial use.

export const pendingTips = (db: D1Database, limit: number): D1PreparedStatement =>
  db.prepare(`SELECT t.id, t.title, t.summary, t.category, t.source_url, ${likeCount} AS likes
    FROM community_tips t WHERE t.review_status = 'pending' ORDER BY likes DESC, t.id DESC LIMIT ?`).bind(limit);

export async function dismissTip(db: D1Database, id: number): Promise<boolean> {
  const updated = await db.prepare(`UPDATE community_tips SET review_status = 'dismissed'
    WHERE id = ? AND review_status = 'pending' RETURNING id`).bind(id).first();
  return Boolean(updated);
}

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
