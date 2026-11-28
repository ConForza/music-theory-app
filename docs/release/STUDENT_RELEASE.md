# Student release: letting your own students in

**What this release is:** the same Railway service that runs the private preview, switched to the student audience
(`MTP_AUDIENCE=students`). Students type a **class code** once per device, then make (or sign in to) their own account. It
stays private: there is no public sign-up, the site asks search engines not to list it, and each class code can be revoked.
A public launch (anyone can sign up, payments) is a separate, later step; see "After this" at the end.

**Merging this is not the same as being ready to invite students.** Before the first child signs in you need the decisions
in section 1 and the staging rehearsal in section 2. Until then, keep `MTP_AUDIENCE` unset (testers only).

## What the app does now

| Need | What is built | Where |
|---|---|---|
| Children can get in without tester passwords | One-field class-code sign-in (codes like `K7QM-3PXA-R9TD-H2WN`; case, spaces and hyphens ignored), "Step 1 of 2" wording, help text if a password is forgotten | `preview-gate.ts`, `npm run preview:invite -- --class <name>` |
| Parents can read how data is used **before** signing in | `/privacy`: a part for students and a part for parents, filled from your settings. You approve **one exact revision** of the text; any change to it (or to the backup period, guest period, contact or host) shows Draft again until you re-approve | `privacy.ts` |
| Progress is not lost to a bad release | Verified snapshots **before any migration** and **daily**, published only once verified. The app **will not start** if the backup folder is unusable or a due snapshot fails | `backups.ts` |
| A deleted account stays deleted | Every snapshot is deleted after `MTP_BACKUP_KEEP` days (default 14), no exceptions. Each deletion is logged (a hash, no personal data) and re-applied at every start-up, so a restored backup cannot bring the learner back | `backups.ts`, `erasures.ts` |
| A backup can actually be restored on Railway | `MTP_RESTORE_FROM=<backup file>` + redeploy: restores **before** the app opens the database, keeps the replaced database as a snapshot, ends every sign-in session, re-applies deletions, and never runs twice | `backups.ts#restoreAtStartup` |
| A child forgets their password | `npm run account:reset-password -- <email>` prints a temporary password (none is ever typed on the command line); the learner changes it in **Settings → Change password** | `scripts/reset-password.ts` |
| Children are never let in by accident | With `MTP_AUDIENCE=students` the app **refuses to start** until: the gate is on, HTTPS-only cookies, a valid and unambiguous code list, your name and contact, an approved notice revision, and backups on the volume | `config.ts#studentReleaseProblem` |
| A release is checked as a student release | The deploy workflow's smoke tests also check, in student mode, that the notice is approved and the sign-in page is the class-code form | `scripts/railway-deploy.mjs` |

Credential boundaries: the testers' preview behaves exactly as before. In student mode, adult testers' passwords still work
typed exactly into the class-code box; HTTP Basic is refused; switching `MTP_AUDIENCE` either way signs every device out
of the gate. Removing a code's entry revokes the **gate** access issued through it; learner accounts and their own sign-in
sessions are separate (they end after 60 days unused, at sign-out, at a password change or reset, or at deletion).

## 1. Decisions only you can make

Each has a recommendation; none is made for you in the code.

| # | Decision | Recommendation for a teacher's own students |
|---|---|---|
| D1 | **Which grades are ready?** `npm run validate:release` fails because nothing is formally teacher-approved. It does not block deployment. | You are the teacher. Work through each grade you will assign (the [sign-off worksheet](../signoff/OWNER_SIGNOFF_WORKSHEET.md) lists what is most worth checking), tell students which grades to use, and tell parents the course is new and errors can be reported to you. Formal approval of everything is for a public launch. |
| D2 | **Lawful basis, and the Children's Code.** UK GDPR and the ICO's Age Appropriate Design Code apply to an online service children use. | The usual fit for a teacher's tool for their own pupils is **legitimate interests** (or the lessons agreement with the parent). Run the ICO's [lawful basis tool](https://ico.org.uk/for-organisations/advice-for-small-organisations/lawful-basis-interactive-guidance-tool/), check whether you must pay the ICO data protection fee, and write down a short data protection impact assessment (the ICO expects one for services likely to be used by children). Take advice if unsure. |
| D3 | **Enrolment and recovery.** Registration needs an email; the app does not verify that the person owns it, each email can hold one account, and "already registered" tells a visitor (who has the class code) that an address is in use. | Parents create the account with **their own email** and a nickname for the child. For siblings, a Gmail or Outlook address can use a "+" alias (`parent+amy@gmail.com`, `parent+ben@gmail.com`): mail reaches the same inbox and each child has their own account. Keep a private list of which family uses which address, and **only reset a password or act on a data request when it comes from that address or a phone number you already know.** If you would rather issue accounts yourself, say so: that is a follow-up feature. |
| D4 | **Retention.** Guests (currently kept until asked), backups (`MTP_BACKUP_KEEP`, default 14 days) and the erasure log (`MTP_ERASURE_LOG_DAYS`, default 400 days: at least as long as the oldest backup you could restore, including Railway's). | Guests: set `MTP_GUEST_RETENTION_DAYS=120` for a week (dry run), then `MTP_GUEST_RETENTION_APPROVED=owner-approved`. Backups: 14 days. Each change gives a new notice revision to approve. |
| D5 | **The host as processor, and transfers.** Railway Corporation is a US company; your data sits in its EU West (Amsterdam) region. | Read Railway's data processing terms (in its legal pages) and note how they cover access from the USA. If you move region or host, set `MTP_PRIVACY_HOSTING` and re-approve the notice. |
| D6 | **How much data can you afford to lose, and how fast must it come back?** | Suggested: lose at most one day (the daily snapshot), back within a day. That needs an **independent copy**: the app's snapshots share the database's volume, and Railway's volume backups are deleted with the volume. Decide where encrypted copies live (step 7) and rehearse a restore (section 2). |
| D7 | **Railway plan.** Hobby ($5/month) has no volume backups. | Pro ($20/month) adds Railway's volume backups as a second layer, but they are not independent of the volume. Either plan still needs the off-Railway copy in D6. |
| D8 | **Your own web address** (optional). | `theory.yourstudio.co.uk` looks more trustworthy to parents. Railway → Settings → Networking → Custom domain, then update `MTP_ALLOWED_ORIGINS` and the `RAILWAY_PUBLIC_URL` GitHub variable. |

## 2. Rehearse in staging first (before any child signs in)

Use a **separate Railway environment** (Project → Environments → New, e.g. `staging`) with its own volume at `/data`, its
own domain and made-up data only. Copy the production variables, but with a new `MTP_PREVIEW_ACCESS` entry and
`MTP_DB=/data/mtp.sqlite`, `MTP_BACKUP_DIR=/data/backups`. Then, in staging:

1. Deploy, and confirm the log shows `Automatic backups ON`, `Erasure log …` and `Daily backup … verified` **before** `listening`.
2. Switch to students (section 5) and sign in with a class code; make two test accounts; do a lesson on each.
3. **Readiness:** set `MTP_BACKUP_DIR=/nonexistent-volume/backups` and deploy. It must refuse to start (`not on the volume` or `not writable`). Put it back.
4. **Restore rehearsal:** note the newest `mtp-daily-….sqlite` name (Console: `ls /data/backups`). Delete one test account in Settings and do another lesson on the other. Set `MTP_RESTORE_FROM=<that file name>` and deploy. The log must say `RESTORED …`, `1 account(s) deleted after the backup erased again`. Sign in to the remaining account: progress is as it was at the backup; the deleted one stays gone. Remove `MTP_RESTORE_FROM`.
5. **Proxy and capacity** (section 4), against staging.
6. **Off-Railway copy** (step 7): take one, open it with `npm run db:backup -w @mtp/api -- verify <file>`, and restore it into staging with the copy uploaded to `/data/backups` and `MTP_RESTORE_FROM`.

Write down the date and what you saw. Delete the staging environment afterwards if you like (it only holds test data).

## 3. Merge and deploy to production (still testers only)

1. Merge this PR. It adds **no migrations**.
2. Railway → Variables: `MTP_BACKUP_DIR=/data/backups`.
3. **Backup before deploying:** the workflow asks you to confirm a verified backup whenever the database state is uncertain or migrations changed. That must be a **fresh** copy taken just before the deploy ([RAILWAY.md](../development/RAILWAY.md#backups-before-a-deploy)); an earlier automatic snapshot may predate the latest progress. Choose `not-confirmed` only when the workflow allows it.
4. Run **[Deploy to Railway](https://github.com/ConForza/music-theory-app/actions/workflows/deploy-railway.yml)**. Check the log as in section 2, step 1.

## 4. Fix the shared-address rate limits (required for a class)

Until `MTP_TRUST_PROXY_HOPS` is set, every visitor looks like the same address (Railway's edge), so the limits are shared by
**everyone**: 20 new accounts, 60 sign-ins and 100 class-code attempts per 15 minutes, and 60 practice-exam starts per 10
minutes. Railway documents `X-Real-IP` for the client address; its staff say the edge also replaces any `X-Forwarded-For` a
client sends, which would make `MTP_TRUST_PROXY_HOPS=1` right. That contract is **not documented**, so verify it on staging:

1. Set `MTP_TRUST_PROXY_HOPS=1`, deploy.
2. From a laptop, send 101 failed class-code attempts, each pretending to come from a different address:

   ```sh
   A=https://<staging address>
   for i in $(seq 101); do curl -s -o /dev/null -w "%{http_code} " -X POST "$A/preview/signin" \
     -H "content-type: application/x-www-form-urlencoded" -H "origin: $A" -H "X-Forwarded-For: 203.0.113.$((i % 250))" \
     --data "password=WRONG$i"; done; echo
   ```

   **Expected:** `401` about 100 times, then `429`. Never a `429`: forged headers are believed. **Remove the variable** and report it.
3. Straight away, on a phone **on mobile data**, sign in with the class code. **Expected:** it works. If it is refused with "Too many attempts", everyone still shares one address; remove the variable and report it.
4. Account sign-ins have their own limit (60 failed sign-ins per address per 15 minutes). Check it the same way, in **testers** mode on staging, where scripts may pass the gate with a tester's details (`-u tester:password`): send 61 failed `POST $A/api/auth/login` requests (`-H "content-type: application/json" -H "origin: $A" --data '{"email":"nobody'$i'@example.org","password":"x"}'`, each with a different forged `X-Forwarded-For`). **Expected:** `401`s, then `429`; and the phone on mobile data can still sign in to its account straight afterwards.
5. **One school network:** if a class registers together from school wifi, they really do share one address. The limit is 20 new accounts per 15 minutes per address; set `MTP_REGISTRATIONS_PER_15_MIN=40` (or the class size plus a margin) before that lesson, and rehearse with that many test registrations on staging.

## 5. Approve the notice, make class codes, switch to students

1. Open `https://<address>/privacy` and read both parts. At the foot it says `Notice revision 1a2b3c4d`.
2. Railway → Variables:
   * `MTP_PRIVACY_OPERATOR` = how parents know you, e.g. `Jane Smith Piano Studio`
   * `MTP_PRIVACY_CONTACT` = the email parents write to about their child's data
   * `MTP_PRIVACY_NOTICE_APPROVED` = `<today's date>/<revision>`, e.g. `2026-12-02/1a2b3c4d`. Setting the operator and contact changes the revision: deploy once with them set, read the page again, then approve the revision it shows.
3. Class codes, in Railway → the running deployment → **Console**: `cd packages/api && npm run preview:invite -- --class piano-2027`. Append the printed entry to `MTP_PREVIEW_ACCESS` (comma-separated). One code per class, or per family if you want to revoke families separately.
4. `MTP_AUDIENCE=students` and `MTP_SECURE_COOKIES=1`; deploy. If it refuses, the log lists every missing setting; nothing was opened or changed. The log shows `Preview access gate ON: N class code(s) for students.` and the deploy summary says `student release with an approved privacy notice`.
5. On your phone: class code, make an account, a lesson, Settings → Change password, Settings → Your data (privacy link), sign out.

## 6. If something goes wrong: restoring

Only for corruption or a bad release, never to undo an ordinary deploy. It discards everything learners did after the backup.
1. Console: `ls /data/backups` and choose the file (`mtp-daily-…` or `mtp-premigration-…`).
2. Set `MTP_RESTORE_FROM=<file name>`, deploy, read `RESTORED …` in the log, then **remove** the variable (it will not run twice, but it reminds you on every start).
3. Every learner signs in again. Repeat any password reset made since the backup. Tell families.

## 7. Looking after it

* **Forgotten password:** confirm the request comes from the family's known address or phone (D3). Console → `cd packages/api && npm run account:reset-password -- parent@example.org`. Pass the printed temporary password privately; the learner signs in and changes it in Settings → Change password.
* **Delete a child's data:** the learner does it in Settings → Your data. If they cannot sign in, reset the password (as above), sign in as them, delete. It leaves the backups within `MTP_BACKUP_KEEP` days and stays deleted after any restore.
* **Independent copy (D6):** weekly, from a Mac: `railway login`, `railway link` (production), then `railway ssh -- cat /data/backups/<newest mtp-daily file> > mtp-$(date +%F).sqlite`, check it with `npm run db:backup -w @mtp/api -- verify mtp-<date>.sqlite`, and keep it encrypted (FileVault, or an encrypted disk image) somewhere other than Railway. Delete copies older than `MTP_BACKUP_KEEP` days so the retention you promised holds there too. (The `railway ssh` route is unverified until you try it in section 2.)
* **Watch the logs:** any `BACKUP FAILED` line means no new snapshot that hour; fix it the same day (copies age out after `MTP_BACKUP_KEEP` days).
* **Releases:** merge, then run the Deploy workflow (with a fresh backup when it asks). Short gap of about a minute.
* **New school year:** make new class codes and remove last year's entries.

## Parent letter (template)

> Dear parent or carer,
>
> I am inviting [child] to **Music Theory Path**, a short-lesson course I use to support music theory from Grade 1 to Grade 5.
> It works in any web browser on a phone, tablet or computer, and can be added to the Home Screen like an app.
>
> 1. Open **[address]** and enter the class code **[code]**.
> 2. Create an account using **your own email address** and a nickname for [child] (it does not need to be a real name).
>    For brothers and sisters, you can add `+name` before the @ (for example `you+amy@gmail.com`) so each has their own account.
>
> The app has no adverts, no chat and no leaderboards, and nobody else can see your child's progress. Please read the privacy
> notice at **[address]/privacy** before signing up; it explains what is kept and how to download or delete it. If you forget
> the password, contact me from this email address and I will reset it.
>
> The course is new and still being checked, so if a question looks wrong, please tell me. It is my own material and is not
> an official ABRSM product. Please do not share the class code outside our studio.

## After this: a public launch

Needed before anyone outside your studio can sign up (and before charging): the content approvals that make
`npm run validate:release` pass ([RELEASE_GATES.md](../signoff/RELEASE_GATES.md)); a privacy and Children's Code review with
advice; an age or parent-consent step at sign-up and verified emails; a "forgot password" email; turning the gate off for
public sign-up (today the app refuses to run on Railway without it, deliberately); a shared rate-limit store; terms of use;
and payments. Also take advice on how "ABRSM" may be used in marketing.
