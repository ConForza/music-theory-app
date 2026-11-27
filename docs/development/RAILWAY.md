# Railway private preview: setup and runbook (issue #24)

**Status: private preview, deployed on Railway Hobby** at <https://mtpcurriculum-production.up.railway.app/> (invited adults and internal testers only).
Hosting is Railway Hobby (decided 16 Nov 2026); other hosts are out of scope. **Deployments are manual and never automatic**: merging a PR does not deploy.
To ship `main`, run **[Deploy to Railway](https://github.com/ConForza/music-theory-app/actions/workflows/deploy-railway.yml)** (see "Manual deployment" below).
The setup checklist is kept as the record of how the service was provisioned; steps marked **OWNER** needed the owner.

## What lives where

| Item | Where | Value |
|---|---|---|
| Build / start / healthcheck / restart policy | **Code**: `railway.json` | `npm run build` (Railpack runs `npm ci` first), `npm start`, `GET /api/health`, timeout 300 s, restart on failure (5 tries) |
| `tsx` available at runtime | **Code**: `packages/api/package.json` | `tsx` is a runtime dependency (the start script is `node --import tsx`) |
| Access gate, storage guard | **Code** | `preview-gate.ts`, `config.ts#railwayProblem`; on Railway the app **refuses to start** without the gate, a volume, or `MTP_DB` inside it |
| One service, one replica, region, volume `/data`, auto-deploy off | **Railway service settings** (OWNER) | see checklist |
| Manual deployment (CI check, backup rule, deploy, verify) | **Code**: `.github/workflows/deploy-railway.yml`, `scripts/railway-deploy.mjs` | see "Manual deployment" |
| `MTP_DB=/data/mtp.sqlite`, `MTP_PREVIEW_GATE=1`, `MTP_PREVIEW_ACCESS`, `MTP_SECURE_COOKIES=1`, `MTP_ALLOWED_ORIGINS`, `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=20` | **Railway variables** (OWNER) | secrets only in `MTP_PREVIEW_ACCESS` (hashes, no passwords) |
| Never set | | `MTP_WARM_POOLS=0`, `MTP_GUEST_RETENTION_APPROVED`, `MTP_SHOW_READINESS`, `MTP_TRUST_PROXY_HOPS` (until verified, below), `MTP_TEST_CLOCK` |

## Setup checklist (OWNER, in the Railway dashboard)

1. New project, **Deploy from GitHub repo** `ConForza/music-theory-app`, branch `main` (after this PR is merged). Railway reads `railway.json`.
2. **Service settings → Source: turn automatic deploys OFF** (and use "wait for CI" if offered). If the first build starts automatically, stop it from the dashboard before it goes live.
3. **Region: EU West (Amsterdam)** if offered on Hobby. Record the actual region shown on the service and on the volume (it is "EU West", **not UK**).
4. **Volume**: attach to the service, mount path `/data`. Confirm `RAILWAY_VOLUME_MOUNT_PATH=/data` appears in the service variables. Volumes are mounted at **runtime only**; the build and any pre-deploy step never touch the database (this repo defines no pre-deploy command, and migrations run on app start).
5. **Replicas: 1.** Do not add a second service or replica against `/data`.
6. **Variables**: `MTP_DB=/data/mtp.sqlite`, `MTP_PREVIEW_GATE=1`, `MTP_SECURE_COOKIES=1`, `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=20`. If Railway runs the container as non-root and `/data` is not writable, add `RAILWAY_RUN_UID=0` (unverified; check the startup log).
7. **Testers** (see below): add at least one entry to `MTP_PREVIEW_ACCESS` **before** the first deploy.
8. *(Historical: done for the live preview.)* **Do not generate a domain yet.** Without public networking the service is reachable only inside Railway, which is the safe default. Deploy once (manual "Deploy"), check the deploy logs for `Review pools ready`, `Preview access gate ON: N invited tester(s)` and the healthcheck passing.
9. *(Historical: the domain now exists.)* **Approval point:** when you decide to open it to testers, generate the Railway domain (HTTPS is provided by Railway), then set `MTP_ALLOWED_ORIGINS=https://<that-domain>` and redeploy. Verify forwarded headers before touching `MTP_TRUST_PROXY_HOPS` (below).
10. **Backups**: new Railway volume backups and schedules require the **Pro** plan (per the owner's review of this service's Backups tab), so on Hobby rely on the app-level snapshot (below) taken from the dashboard Console, before any release the deploy workflow asks a backup for (migrations, or an uncertain database state).

## Testers: invite and revoke

The gate sits in front of **every** route (web app, assets, `/robots.txt`, all `/api/*`), separate from learner accounts. Since the PWA brief a
tester signs in on a small **preview sign-in page** (`/preview/signin`) with their tester name and password, which creates an HttpOnly preview
session cookie (about once per device; an installed Home Screen app may open already signed in, or ask once more); there is no HTTP Basic prompt any more. Open without it:
`GET /api/health` (read-only, returns `{ok, curriculumVersion}`, what Railway's healthcheck needs), the sign-in page, and the installation
metadata (manifest and icons). Guest, registration, login and student routes are not reachable without preview access. Responses carry
`X-Robots-Tag: noindex`. Full design, revocation and tests: `docs/development/PWA_AND_SIGN_IN.md`.

* **Invite**: `npm run preview:invite -w @mtp/api -- alice` prints a random 192-bit password (show it to the tester once, via a private channel) and an entry `alice:<sha256>`. Append the entry to `MTP_PREVIEW_ACCESS` (comma-separated) in Railway and deploy. Only hashes are stored; no credentials are in Git, and none ever go in a URL.
* **Revoke**: remove that tester's entry and deploy. When the new process starts, the credentials stop working and **every preview session issued to that tester is invalidated and deleted** (sessions are tied to the exact entry, so re-issuing a tester's password also ends their old sessions). Learner sessions inside the app are unaffected, but the tester can no longer reach it.
* **Adults and internal testers only.** No children until the age/privacy notice, consent arrangements and data-location decisions are approved. No production WMF data.
* Shared devices: learner sign-out keeps the device's preview access; Settings offers **Sign out and leave the preview on this device** to end both.
* Existing invitations keep working unchanged (same `MTP_PREVIEW_ACCESS` entries). Scripts may still send them as `Authorization: Basic` (`curl -u name:password`); browsers are never challenged.

Message to send testers with their password:

> This is a private, invitation-only preview of Music Theory Path. The course content is **draft** and awaiting teacher sign-off; it is not an
> official ABRSM or exam product and may contain errors. Please do not share the address or your password, and do not enter real personal data
> (use a made-up name and a throwaway email). Your test account and progress may be deleted at any time. Hosting is in Railway's EU West
> (Amsterdam) region.

## Manual deployment (GitHub Actions)

**Run it:** [Actions → Deploy to Railway → Run workflow](https://github.com/ConForza/music-theory-app/actions/workflows/deploy-railway.yml), Branch **main**, choose **Database backup**, press **Run workflow**.
Nothing else triggers it: no push, merge, schedule or pull request.

* **iPhone / iPad**: open the link above in Safari, tap **Run workflow**, keep **Branch: main**, pick the backup choice, tap the green **Run workflow**. (If the button is missing, tap *aA* → *Request Desktop Website*. The GitHub mobile app is not relied on.) Open the run to follow it; the job summary is written for a phone screen.
* **Mac**: same page; or `gh workflow run deploy-railway.yml --ref main -f database_backup=not-confirmed` if you use the GitHub CLI.

### What it does, in order (and refuses when)

1. **Branch**: only `main`. Any other branch fails immediately, before the production environment or any secret is touched.
2. **Exact commit, current tip only**: it deploys precisely the commit the run started on (`GITHUB_SHA`) and tells Railway to build that SHA. It checks the commit is part of `main` **and, immediately before the request, that it is still `main`'s tip**: a queued or re-run dispatch for an older commit is refused (`stale`), so it can never replace newer live code. To ship a newer commit, run the workflow again.
3. **CI, job by job**: the `CI` workflow's **push-to-main run for that exact SHA** must be finished and green, **and** the individual jobs and steps must have succeeded (not been skipped): `curriculum` (with its two work steps), the five browser shards (with their `Browser journeys` step) and the `browser` aggregate. Re-runs are handled (a re-run keeps the run id and raises `run_attempt`; the newest attempt of each job counts, including jobs carried forward). The informational release gate (`validate:release`) stays informational and teacher sign-off is untouched. The required names live in `REQUIRED_CI` in `scripts/railway-deploy.mjs`; **if you rename a CI job or step, update that list in the same PR** (a test checks the two stay in step).
4. **Credentials and domain**: the Railway token must be accepted **and Railway must positively report it as scoped to the configured project and environment** (a missing or unreadable scope refuses). `RAILWAY_PUBLIC_URL`'s host must be one of **this service's own** Railway or custom domains, so health and smoke checks cannot be satisfied by some other site.
5. **Railway must be idle**: it reads the service's latest deployment, active deployments and the 50 newest deployments in one query. Anything not settled (`SUCCESS`, `FAILED`, `CRASHED`, `REMOVED`, `SKIPPED`), including `REMOVING`, unknown or missing states, blocks a new request; incomplete records or a list that omits Railway's own latest deployment are errors, not "assume empty". Nothing is ever cancelled. GitHub also queues a second run of this workflow behind the first (`cancel-in-progress: false`).
6. **Live code and database baseline**: from the *active* deployment's commit (not "the last success in history") and any **newer failed, crashed or removed attempts**, which may have started the app and applied migrations without ever becoming active (the app migrates before it warms up or listens). If the live commit is **not an ancestor** of the target, or a newer attempt sits on a **divergent** history, the run **refuses outright**, even with a confirmed backup: this workflow only moves forward (see Rollback). Any uncertainty (unknown or ambiguous active deployment, newer attempts, live commit not in history, migration changes) requires **Database backup = confirmed-verified**.
7. **Last look, then deploy once**: it re-reads `main`'s tip and Railway's state immediately before the request, then calls `serviceInstanceDeployV2` with that commit SHA. The request is **never retried automatically**. The deployment ID is captured. (A tiny race remains between that last look and the request if someone else deploys from the Railway dashboard or API at the same instant; see "Single deployer".)
8. **Monitor that deployment** (up to 25 min) until `SUCCESS`. `FAILED`, `CRASHED`, `REMOVED`, `SKIPPED` and similar fail the run. Railway accepting the request is **not** success.
9. **Release verification, before and after health/smoke**: Railway must report the requested ID, with the **full requested commit SHA**, as the **only active deployment and the latest**, with no other deployment created at the same moment or later (timestamp ties count as competing). Probing a healthy response from the previous release therefore cannot pass.
10. **Health**: `GET /api/health` must return `{"ok": true}` twice in a row, for up to 6 minutes (the review-pool warm-up is about a minute; the app only opens its port once warm). Probes are uncached (cache-busting parameter and `no-cache`).
11. **Smoke tests** (read-only, unauthenticated, no accounts created, no POSTs): HTTPS only; `/` redirects to `/preview/signin` (gate active); `/api/me` and `/api/course` answer `401 preview_required`; the PWA manifest and every icon it lists load.
12. **Summary** on the run page: commit, CI, live commit before, backup, migrations, deployment ID, result, health, smoke tests, duration, links. Every run ends in exactly one **explicit outcome**, and the wording never claims more than is known:

| Outcome | Meaning |
|---|---|
| ✅ Deployed and verified | Everything above passed. The only green result. |
| ❌ Not deployed | Refused or failed before the request was made. Nothing changed on Railway. |
| ❌ Railway rejected the request | Railway answered with an error. Nothing should have started; confirm in the dashboard. |
| ⚠️ Outcome unknown | The request was sent (or the run was cancelled after that) and Railway's result is not known: socket or server error, no ID returned, polling failed or timed out, cancelled or runner lost. A known deployment ID is kept. **Reconcile in the dashboard before running again.** |
| ❌ Railway deployment failed | Railway itself reports `FAILED`/`CRASHED`/`REMOVED`/`SKIPPED`. |
| ❌ Deployed, but not verified | Railway ran a deployment but the commit, active/latest state, health or smoke tests did not check out. Treat the live app as unverified. |

The deploy workflow never runs migrations, never opens the database and never starts a second app instance. Migrations still run inside the app at start-up, with one replica, the `/data` volume, overlap 0 and draining 20 s as before.

### Single deployer

The workflow, GitHub's concurrency group and its Railway checks stop overlapping *workflow* runs. They cannot stop a deployment started from the Railway dashboard, the Railway CLI or another API caller between the final check and the request. So: **one person deploys at a time, and only through this workflow**. Do not click Deploy, Redeploy or run `railway up` while a run is in progress; if you must act in the dashboard (a rollback), make sure no run is active first.

### Backups before a deploy

**What is automatic: nothing.** The workflow cannot take the app-level snapshot itself: that needs a shell inside the running container, and

* Railway staff replies and forum threads say `railway ssh` needs a user-authenticated session and is not available to project tokens (one community post reports it working with `RAILWAY_TOKEN`; the sources conflict and Railway's docs could not be read from the build environment). Using it would mean storing an **account or workspace token** in GitHub, far broader than "deploy one service", so it is deliberately not done.
* So the workflow **fails closed** and asks you to confirm. Choose one **Database backup** value:
  * `confirmed-verified`: you state a verified backup exists (below). The workflow cannot check this; it records it in the summary. **Never choose it on the strength of a backup route that does not exist for your plan.**
  * `not-confirmed` (default): allowed **only** when everything is clear: the live commit is known and is an ancestor of the release, **no** migration files changed, and no newer failed or ambiguous attempt could have changed the database. Otherwise it refuses with the reasons.

**Taking a verified backup (OWNER).** Do this just before any release that is going to need it, and whenever you are unsure:

1. *iPhone / iPad / any browser:* open the service in the Railway dashboard and use its in-browser **Console** (the owner's review of the live service found the Console already shown there). In the Console, from the app directory:
   `npm run db:backup -- backup /data/mtp.sqlite /data/backups/mtp-$(date +%Y%m%d-%H%M%S).sqlite`
   then check it with `ls -l /data/backups` and `npm run db:backup -- verify /data/backups/<that file>`. The tool prints `OK: N migrations, M users, integrity ok` only if integrity, foreign-key and migration checks pass; anything else (including `FAILED`) means you do **not** have a backup. A phone Console may be fiddly; if it is, use the Mac route.
2. *Mac (fallback):* `railway login` (a user session, not a project token), `railway link`, then `railway ssh -- sh -c 'cd packages/api && npm run db:backup -- backup /data/mtp.sqlite /data/backups/mtp-$(date +%Y%m%d-%H%M%S).sqlite'` and the same `ls` and `verify` checks. Adjust the `cd` if your container's app directory differs.
3. **Railway volume backups are not an alternative on Hobby**: the owner's review of this service's Backups tab found that new volume backups and schedules require the Pro plan. They are not grounds for confirming a backup. Even where available they are file copies of a live WAL database, weaker than the snapshot above.
4. Then run the workflow with **Database backup = confirmed-verified**.

**Limits to remember.** Snapshots in `/data/backups` live on the **same Railway volume** as the database: they protect against mistakes (a bad migration, a bad deploy), **not against losing the volume**. Because Hobby has no volume backups, there is currently **no protection against losing the volume itself** beyond a copy you take out of Railway yourself; decide whether that is acceptable for the preview and treat any such copy as personal data. **Never upload a learner database as a GitHub Actions artifact** (or to any service you have not approved). A future improvement that would remove the manual step is for the app to snapshot itself at start-up before applying migrations; it is out of scope here because migrations must keep running through the existing start-up path.

### One-time setup (OWNER)

Do this once. None of it is stored in the repository, and no one needs to type a credential per deployment.

**0. Make the dispatcher available (needs your decision).** GitHub only offers **Run workflow** for a workflow file that exists on the repository's **default branch**. At the time of the review, GitHub reported the default branch as `claude/jolly-shannon-usykql`, which does **not** contain `deploy-railway.yml`; merging this PR into `main` alone would therefore leave the phone flow unavailable. Choose one:

* *(Recommended)* **Repository → Settings → General → Default branch → switch to `main`** (after this PR is merged), so `main` is the one place code, CI and the deploy workflow live; or
* deliberately publish the same reviewed `deploy-railway.yml` onto the existing default branch (and keep the two copies identical).

Nothing in this PR changes the default branch. **Verify**: open Actions and confirm **Deploy to Railway** is listed in the left sidebar and shows a **Run workflow** button with a Branch picker offering `main`. The workflow itself refuses any branch other than `main`.

**A. Railway: create a deploy-only token and note three IDs**

1. Railway → the project → **Settings → Tokens → New Token**. Name it `github-deploy`, choose the **production** environment, create it, and copy the value now (it is shown once). This is a **project token**: limited to that one project and environment, the narrowest credential Railway offers here, and the only supported credential (the workflow verifies its scope). Do **not** use an account or workspace token.
2. Open the service in the dashboard and read the address bar: it looks like
   `https://railway.com/project/<PROJECT_ID>/service/<SERVICE_ID>?environmentId=<ENVIRONMENT_ID>`. Copy those three IDs. (They are identifiers, not secrets.)
3. Confirm **Source → automatic deployments are OFF** (checklist step 2) and replicas = 1, volume `/data`, overlap 0, draining 20.

**B. GitHub: create the `production` environment**

Repository → **Settings → Environments → New environment**, name exactly `production`, then:

1. **Deployment branches and tags → Selected branches and tags → add `main`** (only). This is what stops any other branch from reading the secrets.
2. *(Optional extra safety)* **Required reviewers**: add yourself to get an Approve button before every deploy.
3. **Environment secrets → Add secret**: `RAILWAY_PROJECT_TOKEN` = the token from A1.
4. **Environment variables → Add variable** (these are not secrets): `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID` from A2, and `RAILWAY_PUBLIC_URL` = `https://mtpcurriculum-production.up.railway.app` (no trailing path). It **must be a domain of this service**; the run refuses otherwise.
5. Use *environment* secrets, not repository secrets: only jobs that run in `production` (and so only from `main`) can read them. Pull-request workflows never receive them, and `CI` does not use them.
6. Do **not** put the token in the repository, in a comment, or in a workflow input.

**C. First run**: choose Branch `main`, **Database backup = confirmed-verified** after taking and verifying a backup (the first run has no earlier history you can rely on), and read the summary. If it reports an API or schema error, see "Railway Hobby limitations and unverified Railway details".

### If something fails

Read the **outcome** at the top of the run summary (table above); it says what is known and what is not.

* **Not deployed / refused** (branch, stale dispatch, CI, credentials, domain, Railway busy or unreadable, rollback or divergence, backup rule): nothing was changed. Fix the cause and run again.
* **Railway rejected the request**: confirm in the dashboard that nothing started, then fix and run again.
* **Outcome unknown** (including a cancelled run or a lost runner after the request): Railway **keeps going on its own**; nothing cancels it. Open the dashboard (link in the summary), find out what is deploying or what is live, and let it settle (or stop it in Railway if it is stuck). **Do not re-run until you have reconciled it**: the next run refuses while a deployment is unsettled, and repeating an ambiguous request could start a second one.
* **Railway deployment failed**: the live app is probably still the previous version or restarting. Read the Railway deploy log (look for `Review pools ready`, `Preview access gate ON` and the first error). Fix forward with a new commit, or roll back code (below).
* **Deployed, but not verified** (wrong commit, not the only active/latest deployment, health or smoke failed): treat the live app as unverified. Check the dashboard and logs; the new version may be running in a bad state. Nothing is rolled back automatically and no snapshot is restored.

## Rollback and recovery

Two different things, never mixed up:

1. **Roll back code (safe, normal)**: Railway dashboard → service → **Deployments** → open the last good deployment → **Redeploy** (or *Rollback*, if your dashboard offers it). It restarts old code on the **same `/data` volume**; learner data is not reverted. Because migrations are forward-only, this is safe only if no migration shipped since that deployment; if one did (**migration 010** is one: see `docs/architecture/FLEXIBLE_LEARNING.md` §5a), prefer fixing forward. A rollback done in the dashboard is outside the workflow's checks: afterwards run the smoke test in the section below by hand.
2. **Restore data (rare, deliberate, owner-led)**: restores a backup over `/data/mtp.sqlite` and **discards learner activity since that backup**. Only for corruption or a bad migration. **There is currently no rehearsed way to do this in production** (see "Backups and restore"); treat it as an owner-led recovery operation until that procedure exists. Announce it. Never use it to roll back a deploy.

**The deploy workflow only moves forward.** It refuses when the live commit is not an ancestor of the release (a rollback or divergent history), even with a confirmed backup, because the database may already be ahead of the code. Rolling back is a deliberate dashboard action (step 1); and because it bypasses the workflow's checks, run the smoke-test list below by hand afterwards.

The workflow never does either automatically.

## Railway Hobby limitations and unverified Railway details

The build environment could **not read Railway's documentation or call its API**, and no production call was made. What follows is what is unverified from the implementer's side; the first real run is the verification, so report any difference.

* **GraphQL schema**: the workflow uses `serviceInstanceDeployV2(serviceId, environmentId, commitSha)` (returns the deployment ID); `deployment(id)` (`id`, `status`, `createdAt`, `meta` with `commitHash`); `deployments(first, input: {projectId, environmentId, serviceId})`; `projectToken { projectId environmentId }`; and `serviceInstance(serviceId, environmentId) { domains { serviceDomains { domain } customDomains { domain } } latestDeployment {…} activeDeployments {…} }` at `https://backboard.railway.com/graphql/v2`, authenticated with the `Project-Access-Token` header. The `serviceInstance` fields were taken from the owner's review against the live public schema; none of it was checked from the build environment. If Railway renames or removes a field, the run fails with a clear "unreadable state" or API message **before** the deploy request.
* **Project-token permissions**: whether a project token may call `serviceInstanceDeployV2` and read `serviceInstance`/`deployments` is not stated in the sources found. If refused, the run stops before deploying (as "credentials" or "railway-state"); the fallback is a **workspace token**, broader than intended, only after you decide that trade-off.
* **`activeDeployments` semantics**: the workflow assumes it lists the deployment(s) currently serving (exactly one, with overlap 0). If Railway lists it differently (for example keeps a draining old deployment during the 20 s drain), the post-deploy check can refuse a good release as "not the only active deployment"; if that happens on the first run, treat it as a finding, do not weaken the check blindly.
* **Exact-SHA deploys with automatic deployments off**: community answers say `commitSha` is the supported way to deploy a specific commit and that Railway validates it against the connected repository. Not confirmed from Railway's docs.
* **`railway ssh` with a project token**: sources conflict; not used by the workflow.
* **Volume backups**: per the owner's review of this service, new volume backups and schedules require **Pro**; Hobby has none to rely on.
* **Console and restore**: the Railway Console and `railway ssh` need a **running** container, which has the app writing to `/data`. No supported, rehearsed way to run `db:backup restore` against a stopped service was found; see "Backups and restore".
* **Deployment URL format**: the dashboard link in the summary opens the service page; per-deployment deep links were not relied on.
* **A healthy `/api/health` does not name the commit** (it returns only `ok` and the curriculum version; adding a commit to this open endpoint was deliberately avoided). The commit is verified from Railway's deployment record, with the active/latest binding above.
* **Hobby limits** that affect this workflow: a service with a volume cannot overlap deployments, so every deploy has a short outage (warm-up), and Railway may redeploy Hobby workloads itself; GitHub keeps only one waiting run per concurrency group.

## Deploys, maintenance windows and rollback

**One writer rule**: the old process must exit before the new one writes `/data/mtp.sqlite`. Railway documents that a service with a volume does not run
two active deployments on the volume, so expect downtime of roughly the start-up warm-up (see below). Verify this on the first real deploy (the logs
should show the old deployment stopping before the new `Review pools ready`), and keep overlap at 0.

* **Normal deploy**: announce a short window; take and verify a backup if the release changes migrations or the workflow says the database state is uncertain (below); run **Deploy to Railway** (next section); it watches the deployment, the healthcheck and the smoke test for you and fails loudly if any step fails. Do not click Deploy in the Railway dashboard for normal releases: that path has none of those checks.
* **SIGTERM**: the app stops accepting connections, finishes requests in flight (up to 10 s), closes the database, exits 0. Draining is set to 20 s so it is not killed first.
* **Start-up failure**: the app exits 1 *without opening the port* (warm-up failure, missing volume, missing gate, bad `MTP_DB`); the deploy fails its healthcheck and Railway restarts up to 5 times. Read the log line. Fix the variable or redeploy the previous good deployment. Nothing half-warmed ever serves.
* **Deployment rollback (code/config)** (full procedure in "Rollback and recovery" below): Railway → Deployments → redeploy the previous successful deployment. This never touches `/data`, so learner data is **not** reverted. Caveat: migrations are forward-only, so rolling back to code older than the database's migrations is only safe if no migration shipped in between; if one did, prefer fixing forward. **Migration 010 (flexible learning) is one of these:** code from before it ignores `lesson_progress.explored` and would open guided steps after lessons explored ahead; see `docs/architecture/FLEXIBLE_LEARNING.md` §5a.
* **Volume restore (data)**: a separate, deliberate action that discards learner data written since the backup. Only for corruption or a bad migration; announce it. Never use it to "roll back a deploy".

## Backups and restore (SQLite-consistent)

A file copy of a live WAL database can be inconsistent, so use the app-level snapshot, which uses `VACUUM INTO` (a transactionally consistent snapshot that includes committed WAL content, safe while learners write) and verifies integrity, foreign keys and migrations. Run it inside the **running** service container, from the Railway dashboard's in-browser **Console** (or `railway ssh` from a Mac after `railway login`):

```sh
cd packages/api   # the app directory inside the container
npm run db:backup -- backup /data/mtp.sqlite /data/backups/mtp-$(date +%Y%m%d-%H%M%S).sqlite
npm run db:backup -- verify /data/backups/<file>
```

Backups on the same volume protect against mistakes, not against losing the volume. Railway volume backups are a Pro-plan feature (per the owner's review), so on Hobby there is nothing else to fall back on: a copy taken out of Railway is the owner's own decision (it is personal data). The deploy workflow cannot run this for you (see "Backups before a deploy"); it requires you to confirm a verified backup whenever the database state is uncertain or migrations change.

**Restore is an owner-led recovery operation, not a supported procedure yet.** `db:backup restore <backup> /data/mtp.sqlite --service-stopped` must only run while **no app process can write** the database (two writers corrupt it), but the Console and `railway ssh` only work in a *running* container, and removing the active deployment removes the container too. No supported, rehearsed way was found to have the volume mounted with the app stopped. Until one is found and practised on disposable data (do this **before** inviting anyone), do not attempt a production restore without a plan the owner has rehearsed. The command itself verifies the backup, moves the old file aside (`*.before-restore-…`), removes stale `-wal`/`-shm`, copies, and verifies. Export/delete of an individual learner is an existing app feature (account export/delete) and works through the gate.

## Healthcheck, start-up and resources

`railway.json` sets `healthcheckPath: /api/health` and a 300 s timeout. The app opens its port only after the eager review-pool warm-up
(**never** set `MTP_WARM_POOLS=0`), so a 200 means ready. Measured here (this PR, sandbox container, full content, with gate on): **46 s** from
process start to a healthy `/api/health`; historical benchmarks were 38-41 s idle and 76-78 s under CPU load (4 cores). **Railway Hobby readiness has
not been measured**: record it from the first deploy log (`Review pools ready: N candidates in S s`) and raise `healthcheckTimeout` only if S approaches 300. Also check
the memory graph (about 190 MB resident expected) and CPU against the Hobby allocation. Railway may redeploy or migrate Hobby workloads; each looks
like a deploy (stop, then warm-up), so expect occasional brief downtime.

## HTTPS, origins, headers, proxy hops

* Railway's public networking provides the HTTPS certificate and domain. `MTP_SECURE_COOKIES=1` makes cookies `Secure`, the same-origin check use `https://<host>`, and the app send HSTS (`includeSubDomains` applies to the Railway domain's host; confirm that is acceptable for the chosen domain). Security headers stay app-owned (`MTP_SECURITY_HEADERS` unset).
* `MTP_TRUST_PROXY_HOPS` stays **unset** until verified. With it unset, all visitors share the edge proxy's address in the rate limiters (fine for a handful of testers; the 60 guests per 15 min is then shared). To verify later (OWNER, after the domain exists): confirm in Railway's networking documentation how many proxies append to `X-Forwarded-For`, test with a forged `X-Forwarded-For` from a client and check the limiter still keys on the real address, and only then set the hop count to that number.
* The gate does not read `Host`, `X-Forwarded-*` or source address, so spoofing those cannot bypass it (covered by test).

## Smoke test (after OWNER authorises deployment)

Record the deployed commit SHA, region, and results.

1. Uninvited: `curl -i https://<domain>/` → 303 to `/preview/signin`; `/api/me`, `POST /api/auth/guest` → 401 `preview_required`; `/api/health` → 200; `/manifest.webmanifest` and the icons → 200; nothing else open. Invited: the preview sign-in page accepts the tester's details once; login/guest works; a revoked entry is refused (and its saved session ends) after redeploy. `curl -u name:password https://<domain>/api/course` → 200.
2. HTTPS and headers: browser dev tools show CSP, `X-Frame-Options: DENY`, HSTS; a POST from the real origin succeeds; no console CSP violations; Bravura music font, stave rendering and WebAudio sound work.
3. iPhone and desktop: run the real-device checklist in `PWA_AND_SIGN_IN.md` §10 (install, one-time sign-ins, relaunch, offline); an early lesson and a Grade 5 lesson, review, placement, practice/mock exam, explanation and marking, export/delete, logout.
4. Persistence: complete a lesson, trigger a redeploy, confirm the account and progress remain; check the deploy log shows the old process stopped first.
5. Backup: take an app backup, verify it, restore it into a **disposable** copy (`restore` to a different path) and open it.
6. Healthcheck timing: log the exact Railway start-up time and the memory peak.

## Confirmed vs unverified

| Confirmed (tested in this repo) | Unverified, needs Railway / owner |
|---|---|
| Gate denies web app, assets, all API incl. guest/register/login, HEAD/POST on health; allows only `GET /api/health`, the preview sign-in page and the exact install-metadata paths; preview sessions survive redeploys and end on revocation; fails closed; spoofed headers ignored | Railpack's build installs devDependencies for the Vite build and keeps `tsx` at runtime (`tsx` is now a runtime dependency to cover the latter) |
| App refuses to start on Railway without volume / `MTP_DB` on it / gate | Field names in `railway.json` against Railway's current schema (dashboard shows config-as-code overrides) |
| Warm-up then listen; 200 only when ready; SIGTERM drains and exits 0; WAL files checkpointed away on clean stop | Hobby warm-up time, memory and CPU; healthcheck host handling by Railway |
| `VACUUM INTO` backup of an uncheckpointed WAL database, verification, restore, refusal of corrupt backups | Region available on Hobby; volume placement; volume permissions (`RAILWAY_RUN_UID`) |
| Origin check: wrong origin 403, right HTTPS origin 200 under `MTP_SECURE_COOKIES=1` | Overlap 0 / draining 20 s variables honoured; no concurrent writers during cutover on Railway |
| | Railway forwarding behaviour and correct `MTP_TRUST_PROXY_HOPS` |
| | Volume backup schedule/retention on Hobby; number of replicas stays 1 |
| Deploy workflow logic against mocks (`npm run test:deploy`): wrong branch, stale dispatch, rollback/divergence refusal, CI at job and step level incl. re-runs and duplicate runs, missing credentials, strict token scope, domain binding, backup and uncertain-baseline rules, unsettled/unknown/incomplete Railway state, ambiguous request outcomes (never "nothing deployed" after the request), failed/timed-out deployment, wrong commit, active/latest/competing deployment checks, health timeout, smoke failures, credential redaction; workflow syntax (actionlint) | Everything in "Railway Hobby limitations and unverified Railway details": real API schema (incl. `serviceInstance` fields), project-token permissions, `activeDeployments` semantics, exact-SHA deploy with auto-deploy off, the Console backup route on a phone, a rehearsed production restore, and the first live run |
