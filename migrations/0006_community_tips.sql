CREATE TABLE community_tips (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('vulnerability', 'attack', 'outage', 'breach', 'research')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'dismissed', 'reviewed')),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX community_tips_queue ON community_tips (review_status, id DESC);

CREATE TRIGGER editorial_tip_reviewed AFTER UPDATE OF review_status ON community_tips
WHEN OLD.review_status != NEW.review_status
BEGIN
  INSERT INTO editorial_events (action, detail)
  VALUES ('tip_' || NEW.review_status, CAST(NEW.id AS TEXT));
END;
