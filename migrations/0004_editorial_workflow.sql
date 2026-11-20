CREATE TABLE editorial_events (
  id INTEGER PRIMARY KEY,
  action TEXT NOT NULL,
  incident_id INTEGER REFERENCES incidents (id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER editorial_draft_created AFTER INSERT ON incidents
BEGIN
  INSERT INTO editorial_events (action, incident_id) VALUES ('report_created', NEW.id);
END;

CREATE TRIGGER editorial_report_changed AFTER UPDATE ON incidents
BEGIN
  INSERT INTO editorial_events (action, incident_id, detail)
  VALUES (
    CASE WHEN OLD.published_at IS NOT NEW.published_at AND NEW.published_at IS NOT NULL THEN 'publication_set'
         WHEN OLD.published_at IS NOT NEW.published_at THEN 'publication_removed'
         ELSE 'report_edited' END,
    NEW.id, NEW.published_at
  );
END;

CREATE TRIGGER editorial_door_assigned AFTER INSERT ON calendar_entries
BEGIN
  INSERT INTO editorial_events (action, incident_id, detail)
  VALUES ('door_assigned', NEW.incident_id, printf('%04d-12-%02d', NEW.year, NEW.day));
END;

CREATE TRIGGER editorial_candidate_reviewed AFTER UPDATE OF review_status ON outage_candidates
WHEN OLD.review_status != NEW.review_status
BEGIN
  INSERT INTO editorial_events (action, detail)
  VALUES ('candidate_' || NEW.review_status, NEW.provider || ':' || NEW.external_id);
END;
