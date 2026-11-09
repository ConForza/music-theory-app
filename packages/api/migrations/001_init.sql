-- Accounts, sessions, profile/settings, lesson progress and attempts.
-- Every learner-owned table is keyed by user_id; all queries in the API are scoped by the session's user.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,              -- NULL for guests
  password_hash TEXT,                     -- NULL for guests (scrypt, see auth.ts)
  display_name  TEXT NOT NULL,
  is_guest      INTEGER NOT NULL DEFAULT 1 CHECK (is_guest IN (0, 1)),
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,            -- SHA-256 of the cookie token; the raw token is never stored
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE profiles (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  experience     TEXT CHECK (experience IN ('new', 'some')),
  selected_grade INTEGER NOT NULL DEFAULT 1 CHECK (selected_grade BETWEEN 1 AND 5),
  onboarded      INTEGER NOT NULL DEFAULT 0 CHECK (onboarded IN (0, 1)),
  settings       TEXT NOT NULL DEFAULT '{}',   -- JSON, validated by the API (theme, motion, sound)
  updated_at     TEXT NOT NULL
);

-- One row per learner per path node.
--   completed_at  = the node counts as complete for prerequisites (sticky; never cleared by a replay)
--   run / run_open = the current play-through; a new run starts when a closed run is replayed or the
--                    lesson content changed underneath an unfinished run
CREATE TABLE lesson_progress (
  user_id                   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id                   TEXT NOT NULL,
  run                       INTEGER NOT NULL DEFAULT 1,
  run_open                  INTEGER NOT NULL DEFAULT 1 CHECK (run_open IN (0, 1)),
  phase                     TEXT NOT NULL DEFAULT 'intro',
  content_version           INTEGER NOT NULL,   -- node.contentVersion of the current run
  curriculum_version        TEXT NOT NULL,      -- release.version when the current run started
  started_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  completed_at              TEXT,
  completed_content_version INTEGER,
  completed_curriculum_version TEXT,
  last_stats                TEXT,               -- JSON summary of the last closed run
  PRIMARY KEY (user_id, node_id)
);

-- Append-only attempt log. `id` is a client-generated idempotency key: replays return the stored result.
CREATE TABLE attempts (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id                 TEXT NOT NULL,
  node_id            TEXT NOT NULL,
  run                INTEGER NOT NULL,
  item_id            TEXT NOT NULL,
  template_id        TEXT NOT NULL,
  template_version   INTEGER NOT NULL,
  content_version    INTEGER NOT NULL,
  curriculum_version TEXT NOT NULL,
  evidence           TEXT NOT NULL CHECK (evidence IN ('learning', 'independent')),
  response           TEXT NOT NULL,             -- JSON
  correct            INTEGER NOT NULL CHECK (correct IN (0, 1)),
  mistake_category   TEXT,
  hints_used         INTEGER NOT NULL DEFAULT 0,
  attempt_number     INTEGER NOT NULL,          -- 1-based, per item within a run
  created_at         TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX attempts_by_item ON attempts(user_id, node_id, run, item_id);

-- Hints are served by the API so that "hint-free" evidence is recorded by the server, not claimed by the client.
CREATE TABLE hint_uses (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  node_id    TEXT NOT NULL,
  run        INTEGER NOT NULL,
  item_id    TEXT NOT NULL,
  level      INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, node_id, run, item_id, level)
);
