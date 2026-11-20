ALTER TABLE community_tips ADD COLUMN submitter_github_id INTEGER;

CREATE TABLE community_tip_likes (
  tip_id INTEGER NOT NULL REFERENCES community_tips(id) ON DELETE CASCADE,
  github_id INTEGER NOT NULL,
  PRIMARY KEY (tip_id, github_id)
) WITHOUT ROWID;

CREATE TABLE community_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  github_id INTEGER NOT NULL,
  login TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX community_sessions_expiry ON community_sessions (expires_at);
