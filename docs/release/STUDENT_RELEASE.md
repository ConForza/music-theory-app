# Student release: letting your own students in

**What this release is:** the same Railway service that runs the private preview, switched to the student audience
(`MTP_AUDIENCE=students`). Students type a **class code** once per device, then make their own account. It is still
private: there is no public sign-up, the site asks search engines not to list it, and each class code can be revoked.
A public launch (anyone can sign up, payments) is a separate, later step; see "After this" at the end.

**What the app does for you now** (this PR):

| Need | What is built | Where |
|---|---|---|
| Children can get in without tester passwords | One-field class-code sign-in written for students; codes like `K7QM-3PXA-R9TD-H2WN` (case, spaces and hyphens ignored) | `preview-gate.ts`, `npm run preview:invite -- --class <name>` |
| Parents can read how data is used **before** signing in | `/privacy`: a short part for students, a fuller part for parents, filled from your settings | `privacy.ts`; linked from the sign-in page, Profile and Settings |
| Progress is not lost to a bad release | Automatic verified snapshot **before any migration** (the app refuses to start without one) and **one a day**, kept for `MTP_BACKUP_KEEP` days | `backups.ts` |
| A child forgets their password | `npm run account:reset-password -- <email>` from the Railway Console | `scripts/reset-password.ts` |
| Children are never let in by accident | With `MTP_AUDIENCE=students` the app **refuses to start** until the gate, an approved privacy notice, your name and contact, and backups are all set | `config.ts#studentReleaseProblem` |

The testers' preview is unchanged until you set `MTP_AUDIENCE=students`.

## 1. Decisions only you can make

Each has a recommendation; none is made for you in the code.

| # | Decision | Recommendation for a teacher's own students |
|---|---|---|
| D1 | **Is the content good enough for your students?** `npm run validate:release` still fails because nothing is formally teacher-approved. It does **not** block deployment (CI reports it as informational). | You are the teacher. Use the course yourself for a week on each grade you will assign (the [sign-off worksheet](../signoff/OWNER_SIGNOFF_WORKSHEET.md) lists what is most worth checking), assign only those grades at first, and tell parents it is new and that errors can be reported to you. Formal approval of all 80 outcomes is needed for a public launch, not for this. |
| D2 | **Privacy notice wording.** | Read `/privacy` on the live site (it shows **Draft** until approved). If anything is wrong for your situation, ask for the text in `packages/api/src/privacy.ts` to be changed. Then set the three `MTP_PRIVACY_*` variables (step 3). |
| D3 | **Lawful basis and children's data.** UK GDPR and the ICO Children's Code apply. | The usual fit for a teacher providing a tool to their own pupils' families is **legitimate interests** (or the lessons agreement with the parent), with the parent handed the class code together with the privacy notice. The app already minimises data (no age, school, real name or photo; no ads, analytics or sharing). Run the ICO's free [lawful basis tool](https://ico.org.uk/for-organisations/advice-for-small-organisations/lawful-basis-interactive-guidance-tool/) and check whether you need to pay the ICO data protection fee (most small businesses do; the ICO's self-assessment takes a few minutes). If unsure, a short call with someone who advises on data protection is worth it before inviting children. |
| D4 | **Accounts for under-13s.** Registration needs an email. | Ask parents to make the account with **their own email** and a nickname for the child. Guest mode also works but progress is tied to one browser and ends after 60 days, so it is a poor fit for a year-long course. |
| D5 | **Guest data retention** (currently kept until someone asks). | Set `MTP_GUEST_RETENTION_DAYS=120` for a week (dry run: the logs show how many guests *would* be deleted), then add `MTP_GUEST_RETENTION_APPROVED=owner-approved`. The privacy notice states the period automatically once approved. See [PRIVACY_PLAN.md](../PRIVACY_PLAN.md#retention-controls-implemented-disabled-pending-the-owners-policy). |
| D6 | **Railway plan.** Hobby ($5/month) has **no volume backups**: the app's own snapshots live on the same volume, so they protect against mistakes, not against losing the volume. | Upgrade to **Pro ($20/month)** before inviting a whole class, and turn on Railway's volume backups as a second layer; or stay on Hobby, accept the risk, and download a copy now and then (step 7). |
| D7 | **Your own web address** (optional). | A domain such as `theory.yourstudio.co.uk` (about £10 a year) looks more trustworthy to parents than `*.up.railway.app`. Railway → service → Settings → Networking → Custom domain; then update `MTP_ALLOWED_ORIGINS` and the `RAILWAY_PUBLIC_URL` GitHub variable to the new address. |

## 2. Before you start: merge and deploy this PR (still in testers mode)

1. Merge this PR into `main`. It adds **no migrations**.
2. In Railway → service → **Variables**, add `MTP_BACKUP_DIR=/data/backups` (keep `MTP_BACKUP_KEEP` unset for 14 days, or set your choice).
3. Run **[Deploy to Railway](https://github.com/ConForza/music-theory-app/actions/workflows/deploy-railway.yml)** (Branch `main`, Database backup `not-confirmed`).
4. In the Railway deploy log check for `Automatic backups ON: /data/backups (keeping 14 of each kind).` and, a moment after start, `Daily backup /data/backups/mtp-daily-….sqlite verified (N users).`

From now on, any release with a migration takes its own verified backup before migrating. The deploy workflow still asks
you to confirm a backup for such releases: the pre-migration snapshot (its log line names the file) is that backup once you
have seen it verified in the log of a previous start, or take one by hand as before ([RAILWAY.md](../development/RAILWAY.md#backups-before-a-deploy)).

## 3. Approve the privacy notice

1. Open `https://<your address>/privacy` (no sign-in needed). Read both parts.
2. Railway → Variables:
   * `MTP_PRIVACY_OPERATOR` = how parents know you, e.g. `Jane Smith Piano Studio`
   * `MTP_PRIVACY_CONTACT` = the email parents should write to about their child's data
   * `MTP_PRIVACY_NOTICE_APPROVED` = today's date, `YYYY-MM-DD` (this is your statement that you read and approved it)
   * optional `MTP_PRIVACY_HOSTING` if you move region (default: "Railway, in its EU West (Amsterdam) region")
3. Whenever the notice text changes in a later PR, read it again and update the date.

## 4. Fix the shared-address rate limits (required for a class)

Until `MTP_TRUST_PROXY_HOPS` is set, every visitor looks like the same address (Railway's edge), so the limits are shared by
**everyone**: 20 new accounts, 60 sign-ins and 100 class-code attempts per 15 minutes, and 60 practice-exam starts per 10
minutes. Fine for testers; a class doing homework at 6pm can hit them.

Railway's documentation names `X-Real-IP` for the client address, and Railway staff state that the public edge **replaces**
any `X-Forwarded-For` a client sends, which makes the right setting `MTP_TRUST_PROXY_HOPS=1`. Community reports conflict, so
check it once yourself (a Mac terminal, about five minutes):

1. Set `MTP_TRUST_PROXY_HOPS=1`, deploy.
2. From a laptop on home wifi, send 101 failed sign-ins, each pretending (with a forged `X-Forwarded-For`) to come from a different address:

   ```sh
   A=https://<your address>
   for i in $(seq 101); do curl -s -o /dev/null -w "%{http_code} " -X POST "$A/preview/signin" \
     -H "content-type: application/x-www-form-urlencoded" -H "origin: $A" -H "X-Forwarded-For: 203.0.113.$((i % 250))" \
     --data "username=nobody$i&password=x"; done; echo
   ```

   **Expected:** `401` about 100 times, then `429`. If you never see `429`, forged headers are being believed: **remove the variable at once** and redeploy.
3. Straight away, on your phone **on mobile data** (a different address), open the sign-in page and sign in. **Expected:** it works. If the phone is refused with "Too many attempts", everyone still shares one address: the setting is not working; remove it and report what you saw.
4. The laptop's address is locked out of sign-in for 15 minutes afterwards; that is the limiter doing its job.

## 5. Make class codes

In Railway → service → the running deployment → **Console** (works in Safari on an iPhone):

```sh
cd packages/api
npm run preview:invite -- --class piano-2027
```

It prints the class code (give it out) and an entry `piano-2027:…` to append to `MTP_PREVIEW_ACCESS` (comma-separated,
alongside the testers' entries, which keep working). One code per class is simplest; one per family lets you revoke a
single family. **Revoke** by removing the entry and deploying: every device that used it is signed out of the app.

## 6. Switch to the student audience

1. Railway → Variables: `MTP_AUDIENCE=students`. Deploy.
2. If it does not start, the deploy log says exactly which setting is missing (`The student release (MTP_AUDIENCE=students) cannot start yet. Set: …`). Nothing was opened or changed.
3. The log shows `Preview access gate ON: N class code(s) for students.`
4. Check on your phone: the sign-in page asks for a **Class code**; `/privacy` has no Draft banner; enter a code, make an account, do a lesson; Settings → Your data shows the privacy link; sign out.
5. The deploy workflow's smoke tests are unchanged and pass in both modes (same paths and error codes).

## 7. Looking after it

* **A forgotten password:** Console → `cd packages/api && npm run account:reset-password -- parent@example.org`. It prints a new password and signs that account out everywhere. There is no "change password" screen in the app yet, so the learner keeps that password (or you set one the family chooses: `… -- parent@example.org 'their-choice'`).
* **A parent asks for their child's data to be deleted:** the learner can do it in Settings → Your data → Delete my data. If they cannot sign in, reset the password, sign in as them, delete. Their data leaves the automatic backups within `MTP_BACKUP_KEEP` days (the notice says so).
* **A copy off Railway (Hobby):** from a Mac, `railway login`, `railway link`, then `railway ssh -- cat /data/backups/<newest mtp-daily file> > mtp-copy.sqlite` and check it with `npm run db:backup -w @mtp/api -- verify mtp-copy.sqlite`. (Unverified on Railway: report if it fails.) That file is your pupils' personal data: keep it encrypted (FileVault) and delete old copies.
* **Releases:** unchanged: merge, then run the Deploy workflow. Announce a short gap (about a minute) to families if you deploy in the evening.
* **New school year:** make new class codes, remove last year's entries.

## Parent letter (template)

> Dear parent or carer,
>
> I am inviting [child] to **Music Theory Path**, a short-lesson course I use to support music theory from Grade 1 to Grade 5.
> It works in any web browser on a phone, tablet or computer, and can be added to the Home Screen like an app.
>
> 1. Open **[address]** and enter the class code **[code]**.
> 2. Create an account. Please use **your own email address** and a nickname for [child] (it does not need to be a real name).
>
> The app has no adverts, no chat and no leaderboards, and nobody else can see your child's progress. Please read the privacy
> notice at **[address]/privacy** before signing up; it explains what is kept and how to download or delete it.
>
> The course is new and still being checked, so if a question looks wrong, please tell me. It is my own material and is not
> an official ABRSM product. Please do not share the class code outside our studio.

## After this: a public launch

Needed before anyone outside your studio can sign up (and before charging): the content approvals that make
`npm run validate:release` pass ([RELEASE_GATES.md](../signoff/RELEASE_GATES.md)); a privacy and Children's Code review with
advice; an age or parent-consent step at sign-up; a "forgot password" email (an email-sending service); turning the
gate off for public sign-up (today the app refuses to run on Railway without it, deliberately); a shared rate-limit store;
terms of use; and payments (Stripe Checkout and a subscription flag on the account are the usual route). Also take advice on
how "ABRSM" may be used in marketing: describing the syllabus you teach towards is different from using their name in a
product name.
