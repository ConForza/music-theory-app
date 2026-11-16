# Privacy plan (UK, age-appropriate): pre-launch checklist

Brief 02 builds the mechanisms; the legal decisions below are for the owner before public launch.

**Built now**
* Data minimisation: nickname, email (sign-in only), password hash, lesson answers. Guests store no personal data.
* No public profiles, followers, leaderboards, adverts or third-party analytics. Reminder notifications are off and not offered yet.
* Export (`GET /api/me/export`) and deletion (`DELETE /api/me`, cascading) from Settings.
* Brief 10 adds `prep_attempts`, `prep_responses`, `prep_hint_uses`, `placement_starts`, `revision_sessions` and `revision_attempts`: the practice-examination and placement questions (as seeds), the learner's raw answers, hints, results, where they chose to start, and revision sessions. All are keyed to the learner with `ON DELETE CASCADE`, included in the export, never shown to anyone else, and never used for rankings or leaderboards (there are none). The optional extra-time setting is stored in the learner's own settings and is never part of a score or shown with a result.
* Session cookie is first-party, `HttpOnly`, `SameSite=Lax`.

**Added in the final release hardening (technical controls only; none of these is a policy decision)**
* Guest accounts: at most 60 new guest accounts per client address per 15 minutes (per process, in memory). The address is the TCP peer, or the entry our own proxies appended when `MTP_TRUST_PROXY_HOPS` is set; a client-supplied `X-Forwarded-For` cannot change it.
* Guests are told, in plain words, that their progress lives in one browser and that guest access ends after the sign-in period (currently 60 days, `SESSION_DAYS` in `auth.ts`). From 14 days before the end, every main page shows when it ends and offers (never requires) creating an account. The date comes from the server's stored expiry.
* Expired sign-in sessions are removed at start-up and once a day. This deletes no learner data.
* A guest-retention mechanism exists and is **switched off**: see "Retention controls" below.
* Export (`GET /api/me/export`) and deletion (`DELETE /api/me`) are tested against every table that holds a learner's rows, including the Brief 10 tables.
* Security response headers, including a Content-Security-Policy that allows no third-party script, style, font, image or connection: see `docs/development/DEPLOYMENT.md`.

**These controls do not make the product legally compliant.** They are mechanisms. Whether they are sufficient, and what the product may lawfully do with children's data, are decisions for the owner with appropriate legal advice.

## Retention controls (implemented, disabled pending the owner's policy)

What exists (`packages/api/src/retention.ts`, `npm run retention -w @mtp/api`):

| Setting | Effect |
|---|---|
| nothing set (the default) | Expired sessions are removed. **No guest account is examined or deleted.** |
| `MTP_GUEST_RETENTION_DAYS=N` | Dry run. Each run logs how many guest accounts *would* be deleted. Nothing is deleted. |
| `MTP_GUEST_RETENTION_DAYS=N` and `MTP_GUEST_RETENTION_APPROVED=owner-approved` | Guest accounts that meet every condition below are deleted, with all their learning records. Any other value of the second variable (including `true` or `1`) is still a dry run. |

An account is deleted only if **all** of these hold: it is a guest; it has no email and no password; it has no sign-in session that could still be used; it was created, and last seen, more than N days ago. A registered learner can never match, whatever the settings. One run deletes at most 500 accounts. Linked records are removed by the database's own `ON DELETE CASCADE` rules, the same path as a learner deleting their own account. Logs contain counts and settings only, never identities.

`npm run retention -w @mtp/api` prints a dry-run report for a database without changing it; `-- --apply` applies whatever the settings above allow.

**No retention period has been chosen in the code, the configuration or this document.** Because a guest's sign-in lasts 60 days and cannot be renewed, a guest account older than that is unreachable by its learner; how long such data should then be kept is the decision below.

**Decision needed before guest deletion is enabled:** the owner states (1) the number of days of inactivity after which a guest account is deleted, (2) that this period and its consequence are described in the privacy notice shown to learners, and (3) who authorised it and when. Only then are the two variables set in the deployment. Recommended first step: set only the period, and read the dry-run counts for a week.

## Owner decisions required

These are owner and legal decisions. Nothing in the repository decides them, and no coding agent should.

| # | Decision | What the software does today | Blocks |
|---|---|---|---|
| 1 | **Guest-account retention period** | Guest rows are kept indefinitely; deletion mechanism present but off | Public launch |
| 2 | **Registered-account retention policy** (inactive accounts, and what happens to data after an account is deleted from backups) | Registered accounts are kept until the learner deletes them; no automatic removal exists or is planned in code | Public launch |
| 3 | **Hosting provider and data storage location** (and backups of the single SQLite file) | Not defined anywhere in the repository | Staging |
| 4 | **Age assurance and arrangements for younger learners** (under-13 consent under UK GDPR Art. 8; parent-managed accounts or guest-only) | No age is asked for or stored; no parental flow exists | Public launch |
| 5 | **Lawful basis, Children's Code (ICO age-appropriate design code) assessment and approval of a privacy notice written for young readers** | No privacy notice text ships with the app | Public launch |
| 6 | **Production rate-limiting architecture** (per-process memory is adequate for one process; a shared store and edge limiting are needed beyond that) | In-memory, per process, fixed 15-minute windows | Scaling beyond one process |
| 7 | **Operational configuration**: HTTPS termination and `MTP_SECURE_COOKIES=1`; `MTP_TRUST_PROXY_HOPS`; which layer sets security headers; health-check grace of at least 60 s; backup and restore of the database file | Documented in `DEPLOYMENT.md`; no hosting configuration exists in the repository to verify | Staging |
| 8 | **Analytics** (if ever added: anonymous counts only, as the brief requires) | None | - |

