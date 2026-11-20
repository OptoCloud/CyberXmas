ALTER TABLE community_tips ADD COLUMN ai_reviewed_at TEXT;

CREATE INDEX community_tips_ai_pending ON community_tips (id)
  WHERE review_status = 'pending' AND submitter_github_id IS NOT NULL AND ai_reviewed_at IS NULL;

CREATE TABLE editorial_ai_digests (
  day TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'ready', 'failed')),
  tip_count INTEGER NOT NULL,
  candidate_count INTEGER NOT NULL,
  shortlist TEXT NOT NULL DEFAULT '[]'
);
