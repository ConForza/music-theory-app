-- Brief 03: practice-lab attempts (demonstration sets and seeded variations). Separate from lesson attempts so
-- practice never affects lesson completion. Same idempotency contract: (user_id, id) is the client's command id.
CREATE TABLE practice_attempts (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,
  item_id            TEXT NOT NULL,             -- showcase item id, or i.gen.<template>.v<version>.s<seed>
  template_id        TEXT NOT NULL,
  template_version   INTEGER NOT NULL,
  seed               INTEGER,                   -- NULL for fixed demonstration items
  curriculum_version TEXT NOT NULL,
  response           TEXT NOT NULL,             -- JSON
  correct            INTEGER NOT NULL CHECK (correct IN (0, 1)),
  mistake_category   TEXT,
  hints_used         INTEGER NOT NULL DEFAULT 0,
  attempt_number     INTEGER NOT NULL,          -- 1-based, per item per learner
  created_at         TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX practice_attempts_by_item ON practice_attempts(user_id, item_id);

CREATE TABLE practice_hint_uses (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    TEXT NOT NULL,
  level      INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id, level)
);
