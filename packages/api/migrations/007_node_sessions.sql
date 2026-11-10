-- Brief 05: server-built practice, review, unit-challenge and grade-assessment runs.
-- A run's questions are generated deterministically on the server (template, version, seed, generation fingerprint), so the
-- learner never supplies a question or a verdict. Completion still goes through lesson_progress (one path-state source), and
-- assessment outcomes are stored separately so a failed attempt is an honest, retryable result and never a completion.

CREATE TABLE node_sessions (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id            TEXT NOT NULL,
  run                INTEGER NOT NULL,
  id                 TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('practice', 'review', 'challenge', 'assessment')),
  status             TEXT NOT NULL CHECK (status IN ('open', 'complete', 'not_passed')),
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  curriculum_version TEXT NOT NULL,
  content_version    INTEGER NOT NULL,
  items              TEXT NOT NULL,   -- JSON: item id, template, version, seed, fingerprint, scope source, credited concepts, section
  summary            TEXT,            -- JSON, stored when the run closes so a repeated "complete" returns the same reply
  PRIMARY KEY (user_id, node_id, run)
);

CREATE TABLE node_attempts (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id               TEXT NOT NULL,     -- client command id (idempotency), as for lesson attempts
  node_id          TEXT NOT NULL,
  run              INTEGER NOT NULL,
  item_id          TEXT NOT NULL,
  template_id      TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  seed             INTEGER NOT NULL,
  response         TEXT NOT NULL,
  correct          INTEGER NOT NULL CHECK (correct IN (0, 1)),
  mistake_category TEXT,
  hints_used       INTEGER NOT NULL DEFAULT 0,
  attempt_number   INTEGER NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX node_attempts_by_item ON node_attempts(user_id, node_id, run, item_id);

-- One row per finished unit challenge or Grade assessment attempt. Practice material only: never an ABRSM result.
CREATE TABLE assessment_results (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id            TEXT NOT NULL,
  run                INTEGER NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('challenge', 'assessment')),
  assessment_id      TEXT NOT NULL,
  assessment_version INTEGER NOT NULL,
  score              INTEGER NOT NULL,
  max_score          INTEGER NOT NULL,
  percent            INTEGER NOT NULL,
  pass_percent       INTEGER NOT NULL,
  passed             INTEGER NOT NULL CHECK (passed IN (0, 1)),
  detail             TEXT NOT NULL,   -- JSON: per-section and per-outcome results
  curriculum_version TEXT NOT NULL,
  completed_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, node_id, run)
);
