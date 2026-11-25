-- Flexible learning: explore lessons out of order, and practise any topic.
-- Additive only. No existing row changes meaning: every row written before this migration gets explored = 0, which
-- `computeNodeStates` treats exactly as before, so existing learners' paths, completions, XP, badges and results are untouched.

-- Set by the server (never by a client) when a learner OPENS a lesson through Explore while the guided path still has it
-- locked. Such a lesson can be completed normally (completion, XP and its own evidence are genuine), but its completion only
-- counts towards unlocking later guided steps once its own guided prerequisites are satisfied, so exploring never opens a
-- unit's practice, review, challenge or the grade assessment, and never earns a qualification badge by skipping.
ALTER TABLE lesson_progress ADD COLUMN explored INTEGER NOT NULL DEFAULT 0 CHECK (explored IN (0, 1));

-- Targeted topic practice: formative sessions on any grade, area, unit or topic, with no lesson required first.
-- Nothing here is ever an input to completion, unlocking, XP, streaks, badges, concept mastery or examination readiness.
-- Answers and hints are recorded as question exposure (question_exposure), so a question met here can never later count
-- as fresh independent evidence in review or a mock examination.
CREATE TABLE topic_practice_sessions (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('open', 'complete', 'abandoned')),
  grade              INTEGER NOT NULL CHECK (grade BETWEEN 1 AND 5),
  scope_kind         TEXT NOT NULL CHECK (scope_kind IN ('grade', 'area', 'unit', 'topic')),
  scope_id           TEXT NOT NULL,          -- the grade number, area id, unit id or concept id
  requested          INTEGER NOT NULL CHECK (requested IN (5, 10, 20)),
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  curriculum_version TEXT NOT NULL,
  items              TEXT NOT NULL,          -- JSON: concept, lesson binding, template, version, seed, generation fingerprint
  summary            TEXT,                   -- JSON, stored when the session closes so a repeated "finish" returns the same reply
  PRIMARY KEY (user_id, id)
);
CREATE INDEX topic_practice_sessions_open ON topic_practice_sessions(user_id, status);

CREATE TABLE topic_practice_attempts (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id               TEXT NOT NULL,            -- client command id (idempotency), as for every other attempt table
  session_id       TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  concept_id       TEXT NOT NULL,
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
CREATE INDEX topic_practice_attempts_by_item ON topic_practice_attempts(user_id, session_id, item_id);

CREATE TABLE topic_practice_hint_uses (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  level      INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id, item_id, level)
);
