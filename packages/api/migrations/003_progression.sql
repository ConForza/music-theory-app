-- Brief 04: XP ledger, daily activity, concept mastery evidence + projections, review sessions, achievements.
-- Engagement (xp_ledger, daily_activity, achievements_awarded) and understanding (mastery_*, review_*) live in separate
-- tables on purpose: neither can be derived from, or rewritten by, the other. Every table is account-scoped and
-- cascades with the user, so export and deletion cover them.

ALTER TABLE profiles ADD COLUMN timezone   TEXT    NOT NULL DEFAULT 'UTC';                                  -- IANA zone, validated by the API
ALTER TABLE profiles ADD COLUMN daily_goal INTEGER NOT NULL DEFAULT 1 CHECK (daily_goal BETWEEN 0 AND 5);  -- sessions a day, 0 = off

-- Append-only XP ledger. (user_id, source_key) is the idempotency key: a retry, a replay or a second device re-sending
-- the same event finds the row instead of adding XP. A capped event is recorded with xp = 0 so replies stay stable.
CREATE TABLE xp_ledger (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key         TEXT NOT NULL,           -- node:<nodeId>:run<n> | review:<sessionId>
  kind               TEXT NOT NULL CHECK (kind IN ('node_complete', 'review_session')),
  node_id            TEXT NOT NULL,           -- path node, or 'review' for review sessions (the cap bucket)
  node_type          TEXT NOT NULL,
  xp                 INTEGER NOT NULL CHECK (xp >= 0),
  base_xp            INTEGER NOT NULL CHECK (base_xp >= 0),
  capped             INTEGER NOT NULL DEFAULT 0 CHECK (capped IN (0, 1)),
  local_date         TEXT NOT NULL,           -- learner-local calendar day when awarded
  timezone           TEXT NOT NULL,
  occurred_at        TEXT NOT NULL,
  curriculum_version TEXT NOT NULL,
  content_version    INTEGER,
  rules_version      INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_key)
);
CREATE INDEX xp_ledger_by_day ON xp_ledger(user_id, node_id, local_date);

-- One row per meaningful learning session. local_date is fixed when the row is written, so a later timezone change never
-- rewrites history. The daily goal and the streak are derived from these rows.
CREATE TABLE daily_activity (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('node_complete', 'review_session')),
  node_id     TEXT NOT NULL,
  local_date  TEXT NOT NULL,
  timezone    TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source_key)
);
CREATE INDEX daily_activity_by_day ON daily_activity(user_id, local_date);

-- Every classified attempt that touches a concept, including the ones that do NOT count (guided, hinted, repeats), so the
-- reason a state changed, or did not, is auditable. counts = 1 means valid independent evidence (a success or a failure);
-- correct is the verdict. The classification is stored and never re-derived, so old attempts are not silently reinterpreted.
CREATE TABLE mastery_evidence (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,           -- lesson:<attemptId> | review:<attemptId>
  concept_id         TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('independent-step', 'review-item', 'guided-step', 'hinted-step', 'retry-after-reveal', 'remedial-step', 'not-first-attempt')),
  counts             INTEGER NOT NULL CHECK (counts IN (0, 1)),
  correct            INTEGER NOT NULL CHECK (correct IN (0, 1)),
  item_id            TEXT NOT NULL,
  template_id        TEXT NOT NULL,
  template_version   INTEGER NOT NULL,
  seed               INTEGER,
  node_id            TEXT,
  session_id         TEXT,
  mistake_category   TEXT,
  content_version    INTEGER,
  curriculum_version TEXT NOT NULL,
  rules_version      INTEGER NOT NULL,
  timezone           TEXT NOT NULL,
  local_date         TEXT NOT NULL,
  occurred_at        TEXT NOT NULL,
  PRIMARY KEY (user_id, id, concept_id)
);
CREATE INDEX mastery_evidence_by_concept ON mastery_evidence(user_id, concept_id, occurred_at);

-- Projection of the evidence per concept. Always rebuildable from mastery_evidence and stamped with the rules version it
-- was computed under. next_due_date is a learner-local calendar date.
CREATE TABLE concept_mastery (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_id     TEXT NOT NULL,
  state          TEXT NOT NULL CHECK (state IN ('learning', 'practising', 'proficient', 'mastered', 'review_due')),
  highest_state  TEXT NOT NULL,
  rules_version  INTEGER NOT NULL,
  next_due_date  TEXT,
  interval_index INTEGER,
  lapses         INTEGER NOT NULL DEFAULT 0,
  detail         TEXT NOT NULL,               -- JSON: counts, dates, mistakes
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (user_id, concept_id)
);
CREATE INDEX concept_mastery_due ON concept_mastery(user_id, next_due_date);

CREATE TABLE review_sessions (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('open', 'complete', 'abandoned')),
  started_at         TEXT NOT NULL,
  completed_at       TEXT,
  local_date         TEXT NOT NULL,
  timezone           TEXT NOT NULL,
  curriculum_version TEXT NOT NULL,
  rules_version      INTEGER NOT NULL,
  items              TEXT NOT NULL,           -- JSON: concept, node, template, version, seed, fingerprint, kind (review | remedial)
  summary            TEXT,                    -- JSON, stored on completion so a repeated "complete" returns the same result
  PRIMARY KEY (user_id, id)
);
-- At most one open session per learner, so two devices opening Review share one session.
CREATE UNIQUE INDEX review_sessions_one_open ON review_sessions(user_id) WHERE status = 'open';

CREATE TABLE review_attempts (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id               TEXT NOT NULL,             -- client command id (idempotency), as for lesson attempts
  session_id       TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  concept_id       TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('review', 'remedial')),
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
CREATE INDEX review_attempts_by_item ON review_attempts(user_id, session_id, item_id);

CREATE TABLE achievements_awarded (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  awarded_at     TEXT NOT NULL,
  trigger_key    TEXT NOT NULL,               -- the event that earned it (node:… | review:… | …), so a retried reply can repeat it
  evidence       TEXT NOT NULL,               -- JSON snapshot of why it was earned
  rules_version  INTEGER NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);
