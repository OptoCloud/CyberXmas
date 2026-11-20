ALTER TABLE outage_candidates RENAME TO editorial_candidates;
ALTER TABLE editorial_candidates ADD COLUMN category TEXT NOT NULL DEFAULT 'outage'
  CHECK (category IN ('outage', 'vulnerability'));
ALTER TABLE outage_source_state RENAME TO editorial_source_state;
