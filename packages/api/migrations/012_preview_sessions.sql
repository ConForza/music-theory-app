-- PWA brief: private-preview sign-in sessions (see src/preview-gate.ts). Additive: one new table, nothing existing is changed.
-- A preview session lets an invited tester's browser (or installed Home Screen app) through the preview gate without HTTP Basic
-- authentication. It is separate from learner sessions: it carries no learner identity and never signs anyone in to an account.
-- `access_fingerprint` ties the session to the exact MTP_PREVIEW_ACCESS entry it was issued under, so removing or replacing a tester's
-- entry ends every session issued to them, on the next deploy.
CREATE TABLE preview_sessions (
  token_hash         TEXT PRIMARY KEY,   -- SHA-256 of the cookie token; the raw token is never stored
  tester             TEXT NOT NULL,      -- the tester name from MTP_PREVIEW_ACCESS
  access_fingerprint TEXT NOT NULL,      -- SHA-256 of that tester's entry when the session was issued
  created_at         TEXT NOT NULL,
  expires_at         TEXT NOT NULL
);
CREATE INDEX preview_sessions_tester ON preview_sessions(tester);
