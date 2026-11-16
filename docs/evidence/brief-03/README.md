# Brief 03 browser evidence

These screenshots were captured by `packages/web/e2e/brief03.mjs` (`SHOTS=docs/evidence/brief-03 node --import tsx e2e/brief03.mjs` after `npm run build`), in real Chromium against the real API and a fresh database. They were quantised to 128 colours to keep the repository small.

| Files | What they show |
|---|---|
| `desktop-*-1.png`, `small-phone-320-*-1.png` | The first question of each of the 13 demonstration sets, unanswered (1280px and 320px) |
| `*-1-correct.png` | The same question after the suite answered it through the real controls and the server graded it correct |
| `small-phone-320-wrong-*.png` | Wrong answers: the authored feedback, the engine's explanation of that answer and per-note ✓/✗ marks |
| `dark-*.png`, `reduced-motion-*.png`, `large-text-320-*.png` | Dark mode, reduced motion and 200% text at 320px |
| `lesson-g5-*.png` | The Grade 5 cadence lesson played end to end in the lesson player |
| `*-score-short-score.png`, `*-practice-lab.png` | A two-stave short-score question, and the practice-lab catalogue |

What the suite checks (all passing at the time of capture):

* Every demonstration item (59, covering all 22 families) is answered through the UI on desktop and at 320px, with subsets on iPhone 14 and iPad. The request the browser sends is intercepted and compared with the answer computed by the engine, and the server must grade it correct.
* axe-core (WCAG 2.0/2.1 A and AA) finds no serious or critical violations on any desktop question or any dark-mode question.
* There is no sideways page scroll at any size, including 200% text at 320px.
* Keyboard only: note reading (radios and Enter), the piano (arrow keys and Enter) and the rhythm builder (Tab and Enter).
* Unsupported interactions: drag-and-drop is not used anywhere. Every placement is tap, arrow keys or typing, so no interaction is unsupported on touch or keyboard.

The Brief 02 journeys (`e2e/run.mjs`) still pass unchanged.
