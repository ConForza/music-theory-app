-- Brief 04 follow-up. Marks one-off application-level data repairs as done (see backfill.ts), so each runs once per database.
-- A separate numbered migration: applied migrations are never edited.
CREATE TABLE data_backfills (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  detail     TEXT NOT NULL
);
