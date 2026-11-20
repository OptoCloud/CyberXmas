CREATE TABLE incidents (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('vulnerability', 'attack', 'outage', 'breach', 'research')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  takeaway TEXT NOT NULL,
  source_url TEXT NOT NULL CHECK (source_url LIKE 'https://%'),
  cvss REAL CHECK (cvss IS NULL OR (category = 'vulnerability' AND cvss BETWEEN 0 AND 10)),
  historical INTEGER NOT NULL DEFAULT 0 CHECK (historical IN (0, 1)),
  published_at TEXT
);

CREATE INDEX incidents_by_publication ON incidents (published_at DESC, id DESC);

CREATE TABLE calendar_entries (
  year INTEGER NOT NULL,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 24),
  incident_id INTEGER NOT NULL UNIQUE REFERENCES incidents (id),
  PRIMARY KEY (year, day)
);
