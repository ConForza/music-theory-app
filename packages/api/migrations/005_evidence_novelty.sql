-- Brief 04 follow-up. Whether an answer was the first time the learner met a question is decided when it is recorded, in the
-- same transaction as the answer, so command order (not a timestamp, which can tie) decides it. Earlier rows default to fresh;
-- the fold still deduplicates repeated question identities within the ledger.
ALTER TABLE mastery_evidence ADD COLUMN fresh INTEGER NOT NULL DEFAULT 1 CHECK (fresh IN (0, 1));
