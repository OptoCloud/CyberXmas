-- Tip moderation, desk attribution and stale AI runs. All additive, so the deployed version keeps working.

-- Who sent a tip, shown to editors only. Older rows keep NULL.
ALTER TABLE community_tips ADD COLUMN submitter_login TEXT;
CREATE INDEX community_tips_by_submitter ON community_tips (submitter_github_id, submitted_at);

-- Accounts an editor has blocked from signing in, sending tips and liking.
CREATE TABLE community_blocks (
  github_id INTEGER PRIMARY KEY,
  login TEXT,
  blocked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Triggers cannot see who acted, so the desk API also writes a row with the editor's name.
ALTER TABLE editorial_events ADD COLUMN actor TEXT;

-- Lets the desk replace a run that never finished.
ALTER TABLE editorial_ai_digests ADD COLUMN started_at TEXT;
