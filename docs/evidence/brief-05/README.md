# Brief 05 browser evidence

Screenshots written by `npm run e2e:grade1` (`SHOTS=docs/evidence/brief-05/screens`), taken from a real Chromium run against the real Grade 1 content and a real server (in-process, test clock). Every journey also runs axe (WCAG 2.0/2.1 A and AA, serious and critical) and a no-sideways-scroll check at the point it is described here.

| File | What it shows |
|---|---|
| `g1-01-path-new-learner.png` | The Grade 1 path for a new learner on an iPhone: Unit 1 lesson 1 available, later nodes locked. |
| `g1-02-locked-node-explains.png` | Opening a locked lesson explains what to finish first. |
| `g1-03-teach.png` | The teaching step of G1-U1-L01 (beats, crotchets, minims, semibreves). |
| `g1-04-demo-rhythm.png` | The rhythm demonstration with Play all. |
| `g1-05-wrong-answer-explained.png` | A wrong answer with its specific explanation and "Try again". |
| `g1-06-lesson-complete.png` | Lesson complete: XP, what to remember, next step. |
| `g1-07-practice-hint.png` | A practice question after asking for a hint. |
| `g1-08-practice-complete.png` | Unit practice finished. |
| `g1-09-challenge-wrong-final.png` | A challenge question answered wrongly: no retry, no hints, move on. |
| `g1-10-challenge-result.png` | Challenge passed: score, pass mark, how each part went, the not-an-ABRSM statement. |
| `g1-11-review-hub-days-later.png`, `g1-11b-review-done.png` | Revision due four days later (test clock) and a finished review session. |
| `g1-12-assessment-not-passed.png` | The Grade 1 assessment below the pass mark: an honest result with what to look at next. |
| `g1-13-assessment-passed.png` | The retake (fresh questions) passing. |
| `g1-14-progress-after-grade.png` | The progress screen after completing the grade. |
| `g1-<device>-question.png` | A lesson question on each of iPhone, 320px phone, iPad portrait, iPad landscape and desktop. |
| `g1-pref-*.png` | A challenge question in dark mode, with reduced motion, and at 200% text at 320px. |

Not shown: sound (the suite checks that no audio context is created when sound is off), and keyboard-only operation (asserted, not photographed).
