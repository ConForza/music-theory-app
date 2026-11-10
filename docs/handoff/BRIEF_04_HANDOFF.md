# Handoff to Brief 04: progression, XP, mastery and revision

**State:** Brief 03 delivers the music rules, the exercise engine (graders for all 22 families, seeded generators), the notation renderer, keyboard and audio, answer controls for every family, and the practice lab. See [EXERCISE_ENGINE.md](../architecture/EXERCISE_ENGINE.md).

## What you can rely on

* **Attempt log.** `attempts` (lessons) and `practice_attempts` (practice lab) record, per attempt:
  * template id and version;
  * seed (practice);
  * content and curriculum version;
  * evidence level (lessons);
  * the exact response;
  * the server's verdict and mistake category;
  * hints used;
  * the attempt number.

  Mistake categories are family-defined ids, so they can drive targeted review.
* **Deterministic generation.** `generateItem(ix, templateId, seed, { scope: effectiveScope(...) })` gives reproducible items within what a learner has been taught, and a stored seed regrades exactly. Review sessions and Brief 10 assessments can draw seeded items through the same path as `/api/practice/generate`. Store the seed and template version with the session.
* **Grading.** `gradeItem` is pure. It never needs the client's opinion and is safe to re-run over the log, for example when recomputing mastery after a rules fix. Do this only together with a recorded rules version.

## Constraints to keep

1. XP and streaks are derived from server-recorded attempts. Never accept client-sent counts. Practice attempts must not complete lessons (they don't today).
2. Mastery counts only independent, first-attempt, hint-free evidence (`policy/progression.json`). Practice-lab items are `evidence: learning`, so decide explicitly before letting them count.
3. A worked answer revealed after three wrong attempts (`solution` in the response) means that question is not mastery evidence in that run.

## Open items

* The teacher review of the golden tables, grouping conventions, vocabulary and demonstration items is still outstanding (see EXERCISE_ENGINE §10).
* `listen-identify` tasks are not authored. If Brief 04 adds audio review, add a template with an audio-free equivalent first.
