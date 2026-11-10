-- Brief 04 follow-up. A separate numbered migration: 003 had already been applied to existing databases, and an applied
-- migration is never re-run, so new tables must never be appended to it.
-- Questions a learner has been shown outside counted evidence (practice-lab attempts and hints). They never earn credit, but a
-- question met here can no longer be "fresh" evidence later, whatever seed it comes back under.
CREATE TABLE question_exposure (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('practice-attempt', 'practice-hint')),
  occurred_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, question_key, source)
);
