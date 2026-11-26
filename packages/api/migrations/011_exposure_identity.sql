-- Review of PR #26 (P1): the same question can be stored under two identities. `question_key` keeps, for older templates, the option
-- order and sampled worked solution that earlier briefs hashed (so stored history still matches); `visibleKey` (question-key.ts) is what
-- the learner sees, whatever the order. Help recorded under one could be missed when the same question came back under the other, so a
-- question whose worked answer a learner had seen could still count as independent in a mock examination.
-- Additive: a nullable column on each table that records help or evidence. Rows written before this have NULL and keep matching by
-- `question_key` exactly as before.
ALTER TABLE question_exposure ADD COLUMN visible_key TEXT;
ALTER TABLE mastery_evidence ADD COLUMN visible_key TEXT;
CREATE INDEX question_exposure_visible ON question_exposure(user_id, visible_key);
CREATE INDEX mastery_evidence_visible ON mastery_evidence(user_id, visible_key);
