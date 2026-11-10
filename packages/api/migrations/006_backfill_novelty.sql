-- Brief 04 follow-up (repair). 005 gave every existing evidence row fresh = 1, which re-credited review answers that had been
-- correctly excluded under the previous rule: "the learner was shown this question earlier, in practice". Restore that exclusion
-- from the stored exposure history. Only rows that are still fresh and have a strictly earlier exposure change; rows written
-- after 005 already carry the decision made at write time (an exposure committed earlier is never later than the answer), and
-- legitimate credit (independent answer first, practice afterwards) is untouched. Idempotent. A new file because 005 had already
-- shipped; an applied migration is never edited.
UPDATE mastery_evidence
SET fresh = 0
WHERE fresh = 1
  AND EXISTS (
    SELECT 1 FROM question_exposure x
    WHERE x.user_id = mastery_evidence.user_id
      AND x.question_key = mastery_evidence.question_key
      AND x.occurred_at < mastery_evidence.occurred_at
  );
