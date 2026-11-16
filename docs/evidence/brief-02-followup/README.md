# Brief 02 follow-up: verification evidence

Produced by `node packages/web/e2e/followup.mjs` (real Chromium against the real API and a temporary SQLite database)
and `packages/web/src/test/followup.test.tsx` / `packages/api/test/ratelimit.test.ts` (unit and integration).
Screenshots in this folder are from that run.

## What was verified automatically

| Journey | Where |
| --- | --- |
| Guest completes lesson → refresh → upgrade → sign out → sign in: completion and progress intact | e2e (iPhone 14) + `followup.test.tsx` |
| An answer begun for A whose delivery fails (before or after the server committed it) is never retried under B after SPA navigation; B's exported attempts stay empty | e2e (both variants; fail with the fix removed) + `P1b` state tests |
| Slow progress reply for account A arriving after account B signed in never shows A's data | e2e + 6 state tests (fail without the fix) |
| Registration: reply lost, setup PATCH failing, offline, refresh mid-onboarding: one account, truthful messages | e2e + 7 UI tests + API tests |
| Grade change / onboarding save failing (500, offline, stalled, slow): no navigation, old grade shown, retry | e2e + UI tests |
| Settings failed/offline/rapid saves roll back, no false "Saved." | e2e + UI tests |
| Piano key names with octave, unique; swipe cue only when overflowing; 44px+ keys; real touch swipe | e2e at 320px, iPhone 14, iPad portrait/landscape, desktop; dark mode |
| Hints in an already-mounted polite live region, no focus loss, single request per tap | e2e + UI tests |
| Keyboard-only path to a completed question set with a visible focus ring on each stop | e2e (desktop, reduced motion) |
| 200% text at 320px; 640×400 CSS px at DPR 2 (≈200% browser zoom of a 1280×800 window) | e2e |
| Double submit, back/forward, interrupted progress refresh with retry, unavailable routes, resize/orientation | e2e |
| Forged `x-forwarded-for` cannot bypass registration limit against the real HTTP server | e2e + API tests |

## What was NOT verified (do not read the above as a full sign-off)

* **No real screen reader was available.** NVDA, JAWS, VoiceOver and TalkBack were not run. The hint and verdict
  live regions are verified structurally (present before content, polite, correct text, focus unchanged), which is
  necessary but not sufficient. Axe results are not screen-reader verification.
* **No real devices.** Touch was emulated in Chromium (device profiles, `hasTouch`, CDP touch events). Real iOS
  Safari momentum scrolling, rubber-banding, `env(safe-area-inset-*)` and Android Chrome were not exercised.
* **"200% zoom"** was approximated by a 640×400 CSS-pixel window at device scale 2 and by `font-size: 200%`; the
  browser's own zoom UI and OS text-size settings were not driven.
* Only Chromium was used; Firefox and WebKit were not.
* Pronunciation of `♯`/`♭` in piano key names ("F♯4 / G♭4") differs between screen readers and needs the manual check below.

## Manual screen-reader script (to run before relying on this work)

Run with NVDA+Firefox/Chrome, VoiceOver+Safari (macOS and iOS), TalkBack+Chrome. Lesson `G1-U3-L03`.

1. Demo step: arrow/swipe to the piano. Each key should announce pitch and octave ("G4, button", "C4, middle C",
   "F♯4 / G♭4"). Confirm sharps and flats are spoken as such and C3/C4/C5 can be told apart.
2. Question 1: activate "Need a hint?". The hint should be announced once ("Hint 1: …") without focus moving; the
   button stays focused. Repeat until "No more hints"; confirm focus stays on that button.
3. Choose a wrong answer, Check: the verdict ("Not quite" + explanation) should be spoken, and focus lands on "Try again".
   Then a right answer: "Correct!" then "Continue" focused.
4. Switch off the network, Check: the alert "Your answer didn't send…" is spoken and the selected answer is kept.
5. Settings: toggle a setting with the network off; the failure is spoken and the control returns to its old state.

Record results in the PR; any deviation is a defect to file.
