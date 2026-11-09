# Application architecture (Brief 02)

Brief 02 adds the student application on top of the Brief 01 curriculum architecture. The curriculum package, content files and validator are unchanged: the app reads them, it does not fork them.

## Stack and why

| Layer | Choice | Reason |
|---|---|---|
| UI | React 19 + React Router 8 + Vite 8, TypeScript | Lean, widely understood, fast on phones. No UI kit, state library or CSS framework: one stylesheet of design tokens. |
| API | Plain Node (`node:http` behind a Fetch-style `app.fetch(Request)` handler), Zod validation | The handler is testable in-process and served by Node without a framework. |
| Storage | SQLite via the built-in `node:sqlite` (Node ≥ 22.13), numbered SQL migrations | Relational, zero extra services or native modules, one file to back up. The data layer is a thin set of prepared statements, so moving to Postgres later is a contained change. |
| Tests | Vitest (API, UI with Testing Library + axe), Playwright (real Chromium journeys) | |

`packages/api` serves the built web app in production (single deployable); in development Vite proxies `/api` to the API.

```
packages/curriculum  (Brief 01)  schema, loader, validator, music rules
packages/api         accounts, sessions, course projection, path state, progress   ← @mtp/curriculum
packages/web         React app                                                      ← types only from @mtp/api / @mtp/curriculum
```

## How the curriculum drives the app

* `GET /api/course` is a **projection of the loaded curriculum**: worlds, units, nodes in path order, learner titles, node types, whether a node is playable. It strips provenance, book and outcome ids. Nothing about the path is hard-coded in components; the path component renders whatever the curriculum contains (5 worlds, 27 units, 222 nodes today). Nodes without a unit (the grade assessment) are rendered as the world's finish line.
* Unlocking uses the resolved `unlockAfter` from `buildIndex` (`resolvedUnlockAfter`), exactly as the handoff specifies. Challenges and assessments never gate lessons because Brief 01 already excludes them from the default chain.
* Lesson content is `LessonContent` JSON. `GET /api/lessons/:id` sends the explanation, demonstration and questions **without answers, hints or feedback**; grading, hints and feedback text come from the server.
* Node `contentVersion` and `release.version` are stored with every run and attempt (see below).

## Node states (`path-state.ts`)

`locked`, `available`, `in_progress`, `completed`, `coming_soon` (no playable content yet). The UI adds `review_available` (completed against older content) and shapes for lesson / practice / review / unit checkpoint / grade assessment / extra (`lib/pathView.ts`, the single place states become visuals).

* XP is never an input. A node unlocks only when every id in its `unlockAfter` is **completed**, and completion is decided by the server from recorded attempts.
* **Preview policy** (`waiveUnwrittenPrerequisites`, on by default): Brief 01 delivered one playable Grade 1 lesson (`G1-U3-L03`), and its prerequisites are unwritten, so nobody could ever complete them. A prerequisite whose content does not exist is therefore treated as not blocking. It never waives a prerequisite that is playable, so the gate engages automatically as Briefs 05–09 add lessons. Set `MTP_WAIVE_UNWRITTEN=0` to run strict. The UI says so ("Early preview…").
* Lessons the player cannot run stay `coming_soon`. Since Brief 03 every answer kind is playable (see [EXERCISE_ENGINE.md](EXERCISE_ENGINE.md)); an item the engine cannot present is still filtered out in `course.ts`, never shown half-working.

## Data model (`migrations/001_init.sql`)

`users` (guest or registered), `sessions` (hashed tokens), `profiles` (experience, selected grade, settings JSON), `lesson_progress` (one row per learner per node: run, open run, phase, content/curriculum versions, completion), `attempts` (append-only, client-generated idempotency id as part of the key, template id/version, content/curriculum version, evidence, response, correctness, mistake category, hints used, attempt number), `hint_uses`. Every learner table is keyed by `user_id` and every query is scoped by the session's user.

### Runs, completion and replays

A **run** is one play-through. `start` is idempotent: it resumes the open run, or opens a new run if the last one finished or the lesson's `contentVersion` changed under it (old attempts stay in the log under their own run/version). `complete` succeeds only when the open run belongs to the lesson version being served (otherwise 409 `stale_lesson`, nothing is written) and every playable question has a correct attempt in that run; the check and the write share one transaction, and an unchanged resumed run keeps the curriculum version it started under; completion is sticky (`completed_at`) so a replay never re-locks dependents. If the content later moves to a newer version, the node stays completed and shows **Review available**; finishing a replay refreshes the completed version.

### Idempotency and retries

Attempt ids are UUIDs, and an id is an immutable command: the client freezes `{id, answer}` while a request is unresolved and resends exactly that on retry, but takes a fresh id if the learner changes their answer. The server returns the stored result only for the same question, run and answer, and records nothing new; any other reuse of an id is a 409 `attempt_conflict`. Another learner's id never collides (key is `(user_id, id)`).

## Accounts and security

* Guest (`POST /api/auth/guest`) or account (`register`, `login`, `logout`). Registering while a guest **upgrades the same user row**, so progress is kept. Signing in to an existing account from a guest session does not merge guest progress, which avoids cross-account contamination (known limitation).
* Passwords: scrypt with a per-user salt. Sessions: 256-bit random token in an `HttpOnly; SameSite=Lax` cookie (`Secure` when `MTP_SECURE_COOKIES=1`); only its SHA-256 is stored. Unsafe methods require JSON and a same-origin `Origin` (or one in `MTP_ALLOWED_ORIGINS`). Credential endpoints are rate-limited (per process): sign-in per email and, more loosely, per address; registration per address. The address comes from the TCP connection, never from `x-forwarded-for` unless `MTP_TRUST_PROXY_HOPS` says how many proxies are ours (see [DEPLOYMENT.md](../development/DEPLOYMENT.md)). Login errors are identical for unknown account and wrong password.
* Sign-out reports success only after the server has invalidated the session; on failure the learner stays signed in with a visible retry.
* `GET /api/me/export` and `DELETE /api/me` give export and deletion; deletion cascades through every table.
* Client-supplied values never set completion, grades or hint usage: hints are served by the API so "hint-free" is recorded by the server.

## Frontend structure

`state/app.tsx` (session, course, progress, settings applied to `<html>`), `components/` (shell, path, node, sheet, notation, keyboard, legend), `pages/` (welcome, onboarding, sign-in, learn, grades, unit, lesson player + steps, profile, progress, settings), `lib/` (path view model, music helpers, WebAudio synth). Settings (theme, motion, sound) are stored on the profile and mirrored in `localStorage` to avoid a flash.

Notation is drawn by the Brief 03 renderer (`components/notation`, Bravura SMuFL glyphs, all four clefs and multi-stave scores); `Staff.tsx` remains as a thin compatibility wrapper. Answer controls live in `components/exercise`, and the practice lab in `pages/Practice.tsx`. See [EXERCISE_ENGINE.md](EXERCISE_ENGINE.md).

## Extension points for later briefs

| Brief | Where it plugs in |
|---|---|
| 03 Exercise engine | **Done.** `grade.ts` delegates to `@mtp/engine` within the node binding's effective scope; `course.ts` uses the engine's `inputFor`; the practice lab adds `/api/practice/*` and `practice_attempts` (migration 002). See [EXERCISE_ENGINE.md](EXERCISE_ENGINE.md). |
| 04 Progression | `attempts` already carries template/content/curriculum versions, evidence level and hint use. XP, streaks and mastery are derived from this log by new tables/services; `computeNodeStates` stays the single authority for unlocking. Add review scheduling beside `last_stats`. |
| 05–09 Content | Add `LessonContent` files and set `contentRef`/`contentStatus` on nodes; they appear on the path automatically. Turn `waiveUnwrittenPrerequisites` off when a grade is complete. |
| 10 Placement | `profiles.experience` records the learner's declared level; placement should write completion through the same server-verified route. |

## Running it

```bash
npm ci
npm run dev        # API on :8787, Vite on :5173
npm run build && npm start   # production-like, single server on :8787
npm run check      # typecheck, lint, curriculum validation, generated-doc check, tests, build
npm run e2e        # real-browser journeys (needs `npm run build` and Playwright's Chromium)
```

Environment: `PORT`, `MTP_DB` (SQLite path), `MTP_STATIC_DIR`, `MTP_SECURE_COOKIES`, `MTP_ALLOWED_ORIGINS`, `MTP_WAIVE_UNWRITTEN`, `MTP_TRUST_PROXY_HOPS`.
