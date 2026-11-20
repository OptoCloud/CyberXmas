CREATE TABLE outage_candidates (
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  impact TEXT NOT NULL CHECK (impact IN ('none', 'minor', 'major', 'critical')),
  provider_status TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  provider_updated_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'dismissed', 'reviewed')),
  PRIMARY KEY (provider, external_id)
);

CREATE TABLE outage_source_state (
  provider TEXT PRIMARY KEY,
  attempted_at TEXT NOT NULL,
  succeeded_at TEXT,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
