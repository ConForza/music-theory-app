# Handoff to Brief 03: notation, audio and exercise engine

**State:** Brief 02 delivers the app shell, accounts, path, lesson player and persistence. See [APP_ARCHITECTURE.md](../architecture/APP_ARCHITECTURE.md).

## What to build on
* **Grading is behind one function.** `packages/api/src/grade.ts` (`gradeResponse`) and `inputFor` in `course.ts` support `choice`, letter-name `pitch` and treble/bass `staff-position`. Replace them with graders implementing `content/engine/engine.json`; items whose kind has no input component are filtered out of the player, so adding a kind is: input component + response schema (`app.ts` `AttemptBody`) + grader + `inputFor`.
* **Renderer swap.** `components/Staff.tsx` and `Keyboard.tsx` are small and sit behind `NotationFragment`. The full renderer must keep: a text alternative, keyboard operation, scroll/scale without clipping at 320px, no colour-only meaning.
* **Attempt contract is final enough to keep:** client UUID, server grading, hints served by the server, `template_version`/`content_version` stored. Add response shapes, not new routes.
* **Presentation modes** (`stave`, `rhythm-line`, `keyboard`) are carried in fragments but only `stave` is drawn today.

## Known gaps Brief 03 should close
* Only treble and bass clefs are drawn; key signatures are not drawn; voices render the first voice only; beams, ties, slurs, tuplets and ornaments are not drawn.
* Audio is a simple WebAudio synth with no rhythm timing or tempo control; there is no audio-free equivalent beyond the text alternative for listening tasks (none exist yet).
* Practice, review, unit checkpoint and grade assessment nodes render and explain themselves but have no player (they are `coming_soon`).
