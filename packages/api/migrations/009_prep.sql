-- Brief 10: placement, practice examinations and personalised revision.
-- Additive only: no existing table is altered, so progression, XP, badges and every historical result keep their meaning.

-- One table for placement checks and full-grade practice examinations ("prep" = preparation). Items, seeds, template versions and the
-- generation fingerprints are stored with the attempt, so any question can be reproduced and a changed generator is detected, never regraded.
CREATE TABLE prep_attempts (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('exam', 'placement')),
  mode               TEXT NOT NULL CHECK (mode IN ('practice', 'mock', 'placement')),
  grade              INTEGER CHECK (grade BETWEEN 1 AND 5),      -- the grade examined; NULL for placement
  status             TEXT NOT NULL CHECK (status IN ('open', 'complete', 'abandoned')),
  seed               INTEGER NOT NULL,
  timed              INTEGER NOT NULL DEFAULT 0 CHECK (timed IN (0, 1)),
  extra_time_percent INTEGER NOT NULL DEFAULT 0 CHECK (extra_time_percent BETWEEN 0 AND 100),
  time_limit_seconds INTEGER,
  deadline_at        TEXT,
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  curriculum_version TEXT NOT NULL,
  blueprint_version  INTEGER NOT NULL,       -- version of the practice-exam / placement blueprint rules this attempt was planned from
  rubric_version     INTEGER NOT NULL,       -- version of the scoring and readiness rubric it was scored under
  items              TEXT NOT NULL,          -- JSON: planned questions (template, version, seed, fingerprint, outcome, concepts, coached flag)
  rubric             TEXT NOT NULL,          -- JSON snapshot of the thresholds in force when the attempt started
  summary            TEXT,                   -- JSON, stored when the attempt closes so a repeated "complete" returns the same reply
  PRIMARY KEY (user_id, id)
);
-- A learner has at most one open attempt of each kind (and grade and mode): starting again resumes it, on any device.
CREATE UNIQUE INDEX prep_attempts_one_open ON prep_attempts(user_id, kind, COALESCE(grade, 0), mode) WHERE status = 'open';
CREATE INDEX prep_attempts_by_user ON prep_attempts(user_id, kind, grade, started_at);

CREATE TABLE prep_responses (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id               TEXT NOT NULL,            -- client command id (idempotency), as for every other attempt table
  attempt_id       TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  template_id      TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  seed             INTEGER NOT NULL,
  response         TEXT NOT NULL,            -- JSON: the raw answer as submitted
  correct          INTEGER NOT NULL CHECK (correct IN (0, 1)),
  mistake_category TEXT,
  hints_used       INTEGER NOT NULL DEFAULT 0,
  attempt_number   INTEGER NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX prep_responses_by_item ON prep_responses(user_id, attempt_id, item_id);

CREATE TABLE prep_hint_uses (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  level      INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, attempt_id, item_id, level)
);

-- Where a learner chose to start after a placement check. Placement never completes anything: this row only lets the path open the
-- first lesson of the chosen grade. Later placements add rows and mark the earlier one superseded; nothing is ever rewritten.
CREATE TABLE placement_starts (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_id        TEXT NOT NULL,
  start_grade       INTEGER NOT NULL CHECK (start_grade BETWEEN 1 AND 5),
  recommended_grade INTEGER NOT NULL CHECK (recommended_grade BETWEEN 1 AND 5),
  accepted_at       TEXT NOT NULL,
  superseded_at     TEXT,
  PRIMARY KEY (user_id, attempt_id)
);

-- Personalised revision (quick review, weak-topic practice, explore and mixed practice).
CREATE TABLE revision_sessions (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,
  mode               TEXT NOT NULL CHECK (mode IN ('quick', 'weak', 'explore', 'mixed')),
  status             TEXT NOT NULL CHECK (status IN ('open', 'complete', 'abandoned')),
  params             TEXT NOT NULL,          -- JSON: minutes, concept, grade, unit, exercise type
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  local_date         TEXT NOT NULL,
  timezone           TEXT NOT NULL,
  curriculum_version TEXT NOT NULL,
  rules_version      INTEGER NOT NULL,
  items              TEXT NOT NULL,
  summary            TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE UNIQUE INDEX revision_sessions_one_open ON revision_sessions(user_id) WHERE status = 'open';

CREATE TABLE revision_attempts (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id               TEXT NOT NULL,
  session_id       TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  concept_id       TEXT NOT NULL,
  template_id      TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  seed             INTEGER NOT NULL,
  response         TEXT NOT NULL,
  correct          INTEGER NOT NULL CHECK (correct IN (0, 1)),
  mistake_category TEXT,
  attempt_number   INTEGER NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX revision_attempts_by_item ON revision_attempts(user_id, session_id, item_id);
