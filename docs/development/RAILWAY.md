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
10. **Backups**: Volume → Backups → enable the schedule you want (manual and scheduled backups are Railway features; check the plan's retention). Also take an app-level backup (below) before every deploy that includes a migration.

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
2. **Exact commit**: it deploys precisely the commit the run started on (`GITHUB_SHA`), checks it is part of `main`, and tells Railway to build that SHA (not "whatever is at the tip").
3. **CI**: the `CI` workflow's **push-to-main run for that exact SHA** must be finished and green (typecheck, lint, validate, tests, build, all browser shards). Missing, queued, running, cancelled or failed CI = refusal. The informational release gate (`validate:release`) stays informational. Nothing about teacher sign-off is changed.
4. **Credentials**: the Railway token must exist, be accepted, and belong to the configured project and environment.
5. **No overlap**: if Railway already shows a deployment in progress (for example after a cancelled run), it refuses and tells you which. It never cancels anything. GitHub also queues a second run of this workflow behind the first (`cancel-in-progress: false`), so two runs can never deploy at once.
6. **Backup rule** (next section).
7. **Deploy once**: `serviceInstanceDeployV2` with that commit SHA. The request is **never retried automatically** (a retry could start a second deployment). The Railway deployment ID is captured and shown.
8. **Monitor that deployment** (up to 25 min) until `SUCCESS`. `FAILED`, `CRASHED`, `REMOVED`, `SKIPPED` and similar fail the run. Railway accepting the request is **not** treated as success.
9. **Commit match**: Railway's record of the deployment must name the requested SHA. A different or unreported commit fails the run, and so does any *newer* deployment appearing during the run.
10. **Health**: `GET /api/health` must return `{"ok": true}` twice in a row, for up to 6 minutes (the review-pool warm-up is about a minute; the app only opens its port once warm). Railway only marks the new deployment `SUCCESS` after its own healthcheck passes and with overlap 0 the old process has stopped, so a healthy answer from the previous version is not accepted as success.
11. **Smoke tests** (read-only, unauthenticated, no accounts created, no POSTs): HTTPS only; `/` redirects to `/preview/signin` (gate active); `/api/me` and `/api/course` answer `401 preview_required`; the PWA manifest and every icon it lists load.
12. **Summary** on the run page: commit, CI, backup, migrations, deployment ID, result, health, smoke tests, duration, links to the app, the Railway dashboard and the run. The run is **green only if every step above passed**; cancelled, interrupted or failed runs are never green.

The deploy workflow never runs migrations, never opens the database and never starts a second app instance. Migrations still run inside the app at start-up, with one replica, the `/data` volume, overlap 0 and draining 20 s as before.

### Backups before a deploy

**What is automatic: nothing.** The workflow cannot take the app-level snapshot itself, because that needs a shell inside the running container (`railway ssh`), and:

* Railway staff replies and forum threads say `railway ssh` needs a user-authenticated session and is not available to project tokens (one community post reports it working with `RAILWAY_TOKEN` and the service name; the sources conflict and could not be checked against Railway's own docs from the build environment). Using it would mean storing an **account or workspace token** in GitHub, which is far broader than "deploy one service" and is deliberately not done here.
* So the workflow **fails closed** and asks you to confirm instead. Choose one **Database backup** value when you run it:
  * `confirmed-verified`: you state a verified backup exists (see below). The workflow cannot check this; it records it in the summary.
  * `not-confirmed` (default): allowed **only** when the workflow can prove the release has **no migration changes** (it compares `packages/api/migrations` between the live commit, taken from Railway's deployment record, and the new one). If the release changes migrations, or it cannot tell (no known live commit, or the live commit is not in the repository history), it refuses.

**Taking a verified backup (OWNER).** Do this just before a release that has migrations (and whenever you are unsure):

1. *Mac (preferred, transactionally consistent):* `railway login`, `railway link` (project, `production`, the service), then
   `railway ssh -- sh -c 'cd packages/api && npm run db:backup -- backup /data/mtp.sqlite /data/backups/mtp-$(date +%Y%m%d-%H%M%S).sqlite'`
   (the runbook's original form: adjust the `cd` if your container's app directory differs). It prints `OK: N migrations, M users, integrity ok` only if the snapshot passed integrity, foreign-key and migration checks. Then confirm the file exists: `railway ssh -- ls -l /data/backups`.
2. *iPhone / iPad:* the dashboard cannot run the utility. Use **Volume → Backups → create a backup** in the Railway dashboard (availability and retention on Hobby are unverified, see below), and for any release with migrations prefer step 1 from a Mac. A volume backup is a file copy of a live WAL database, so it is weaker than step 1.
3. Then run the workflow with **Database backup = confirmed-verified**.

**Limits to remember.** Snapshots written to `/data/backups` live on the **same Railway volume** as the database: they protect against mistakes (a bad migration, a bad deploy), **not against losing the volume**. For that, rely on Railway volume backups and keep a downloaded copy before risky releases. **Never upload a learner database as a GitHub Actions artifact** (or anywhere outside Railway): it contains personal data. A future improvement that would remove the manual step is for the app to snapshot itself at start-up before applying migrations; it is out of scope here because migrations must keep running through the existing start-up path.

### One-time setup (OWNER)

Do this once. None of it is stored in the repository, and no one needs to type a credential per deployment.

**A. Railway: create a deploy-only token and note three IDs**

1. Railway → the project → **Settings → Tokens → New Token**. Name it `github-deploy`, choose the **production** environment, create it, and copy the value now (it is shown once). This is a **project token**: it is limited to that one project and environment, which is the narrowest credential Railway offers for this. Do **not** use an account or workspace token.
2. Open the service in the dashboard and read the address bar: it looks like
   `https://railway.com/project/<PROJECT_ID>/service/<SERVICE_ID>?environmentId=<ENVIRONMENT_ID>`. Copy those three IDs. (They are identifiers, not secrets.)
3. Confirm **Source → automatic deployments are OFF** (checklist step 2) and replicas = 1, volume `/data`, overlap 0, draining 20.

**B. GitHub: create the `production` environment**

Repository → **Settings → Environments → New environment**, name exactly `production`, then:

1. **Deployment branches and tags → Selected branches and tags → add `main`** (only). This is what stops any other branch from reading the secrets.
2. *(Optional extra safety)* **Required reviewers**: add yourself to get an Approve button before every deploy.
3. **Environment secrets → Add secret**: `RAILWAY_PROJECT_TOKEN` = the token from A1.
4. **Environment variables → Add variable** (these are not secrets): `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID` from A2, and `RAILWAY_PUBLIC_URL` = `https://mtpcurriculum-production.up.railway.app` (no trailing path).
5. Use *environment* secrets, not repository secrets: only jobs that run in `production` (and so only from `main`) can read them. Pull-request workflows never receive them, and `CI` does not use them.
6. Do **not** put the token in the repository, in a comment, or in a workflow input.

**C. First run**: choose Branch `main`, **Database backup = confirmed-verified** (the first run has no earlier live-commit record you can rely on), and read the summary. If the first run reports an API error, see "Railway API unverified items" below.

### If something fails

The run page says which step failed and why, and links to the Railway dashboard for the logs. In general:

* **Refused before deploying** (branch, CI, credentials, in-flight deployment, backup rule): nothing was deployed. Fix the cause and run again.
* **Deployment failed, timed out, wrong commit, or health/smoke failed**: the live service may be on the **previous version or in a restart loop**. Nothing is rolled back and no database snapshot is restored automatically. Read the Railway deploy log (look for `Review pools ready`, `Preview access gate ON`, and the first error). Fix forward with a new commit, or roll back code (below).
* **Run cancelled or the runner died** after the deploy request: Railway **keeps deploying** (nothing cancels it). Check the Railway dashboard. The next run refuses to start while a deployment is in flight, which is deliberate; wait for it to finish (or stop it in Railway if it is stuck), then run again.
* **Railway request failed** (API error or timeout on the deploy request): the workflow does not retry; check the dashboard to see whether a deployment started before running again.

## Rollback and recovery

Two different things, never mixed up:

1. **Roll back code (safe, normal)**: Railway dashboard → service → **Deployments** → open the last good deployment → **Redeploy** (or *Rollback*, if your dashboard offers it). It restarts old code on the **same `/data` volume**; learner data is not reverted. Because migrations are forward-only, this is safe only if no migration shipped since that deployment; if one did (**migration 010** is one: see `docs/architecture/FLEXIBLE_LEARNING.md` §5a), prefer fixing forward. A rollback done in the dashboard is outside the workflow's checks: afterwards run the smoke test in the section below by hand.
2. **Restore data (rare, deliberate)**: restores a backup over `/data/mtp.sqlite` and **discards learner activity since that backup**. Only for corruption or a bad migration, with the service stopped, following "Backups and restore" below. Announce it. Never use it to roll back a deploy.

The workflow never does either automatically.

## Railway Hobby limitations and unverified Railway details

Everything below was **not verifiable from the build environment** (Railway's documentation and API were unreachable there, and no production call was made). Treat the first real run as the verification, and report any difference:

* **GraphQL schema**: the workflow uses `serviceInstanceDeployV2(serviceId, environmentId, commitSha)` (returns the deployment ID), `deployments(first, input: {projectId, environmentId, serviceId})`, `deployment(id)` (`status`, `createdAt`, `meta` with `commitHash`) and `projectToken { projectId environmentId }` at `https://backboard.railway.com/graphql/v2`, authenticated with the `Project-Access-Token` header (Railway documents this header for project tokens). Field names and status values come from Railway's published schema as recalled and from community sources; they were not checked against the live schema. If Railway renames something the run fails with the API's own message and nothing is deployed.
* **Project token permissions**: whether a project token may call `serviceInstanceDeployV2` and read deployments is not stated in the sources found (community threads ask the same question). If it is refused, the run fails at "credentials" or "railway" and nothing is deployed; the fallback is a Railway **workspace token**, which is broader and should only be used after you decide that trade-off.
* **Exact-SHA deploys with automatic deployments off**: community answers say `commitSha` is the supported way to deploy a specific commit, and that Railway validates it against the connected repository. Not confirmed against Railway's docs.
* **`railway ssh` with a project token**: sources conflict (see Backups); not used by the workflow.
* **Volume backups on Hobby**: availability, schedule and retention unverified.
* **Deployment URL format**: the dashboard link in the summary opens the service page; per-deployment deep links were not relied on.
* **A healthy `/api/health` does not name the commit** (it returns only `ok` and the curriculum version, and adding a commit to this open endpoint was deliberately avoided). The commit is verified from Railway's deployment record instead.
* **Hobby limits** that affect this workflow: a service with a volume cannot overlap deployments, so every deploy has a short outage (warm-up), and Railway may redeploy Hobby workloads itself; GitHub keeps only one waiting run per concurrency group.

## Deploys, maintenance windows and rollback

**One writer rule**: the old process must exit before the new one writes `/data/mtp.sqlite`. Railway documents that a service with a volume does not run
two active deployments on the volume, so expect downtime of roughly the start-up warm-up (see below). Verify this on the first real deploy (the logs
should show the old deployment stopping before the new `Review pools ready`), and keep overlap at 0.

* **Normal deploy**: announce a short window; take a backup if the release has migrations (below); run **Deploy to Railway** (next section); it watches the deployment, the healthcheck and the smoke test for you and fails loudly if any step fails. Do not click Deploy in the Railway dashboard for normal releases: that path has none of those checks.
* **SIGTERM**: the app stops accepting connections, finishes requests in flight (up to 10 s), closes the database, exits 0. Draining is set to 20 s so it is not killed first.
* **Start-up failure**: the app exits 1 *without opening the port* (warm-up failure, missing volume, missing gate, bad `MTP_DB`); the deploy fails its healthcheck and Railway restarts up to 5 times. Read the log line. Fix the variable or redeploy the previous good deployment. Nothing half-warmed ever serves.
* **Deployment rollback (code/config)** (full procedure in "Rollback and recovery" below): Railway → Deployments → redeploy the previous successful deployment. This never touches `/data`, so learner data is **not** reverted. Caveat: migrations are forward-only, so rolling back to code older than the database's migrations is only safe if no migration shipped in between; if one did, prefer fixing forward. **Migration 010 (flexible learning) is one of these:** code from before it ignores `lesson_progress.explored` and would open guided steps after lessons explored ahead; see `docs/architecture/FLEXIBLE_LEARNING.md` §5a.
* **Volume restore (data)**: a separate, deliberate action that discards learner data written since the backup. Only for corruption or a bad migration; announce it. Never use it to "roll back a deploy".

## Backups and restore (SQLite-consistent)

Railway volume backups copy the volume files; a file copy of a live WAL database can be inconsistent, so also use the app-level snapshot, which uses
`VACUUM INTO` (a transactionally consistent snapshot that includes committed WAL content, safe while learners write) and verifies integrity,
foreign keys and migrations. Run inside the service container (`railway ssh`, or the dashboard shell):

```sh
cd packages/api   # the app directory inside the container
npm run db:backup -- backup /data/mtp.sqlite /data/backups/mtp-$(date +%Y%m%d-%H%M%S).sqlite
npm run db:backup -- verify /data/backups/<file>
```

Backups on the same volume protect against mistakes, not against losing the volume; rely on Railway volume backups for that, and download a copy
before risky changes. The deploy workflow cannot run this for you (see "Backups before a deploy"); it requires you to confirm a verified backup for releases that change migrations. **Restore** (two writers corrupt writes): stop the service first (dashboard: remove/stop the active deployment), then run in a
one-off shell with the service stopped: `npm run db:backup -- restore <backup> /data/mtp.sqlite --service-stopped`. It verifies the backup, moves the old
file aside (`*.before-restore-…`), removes stale `-wal`/`-shm`, copies, and verifies; then redeploy. Practise this once on disposable data
before inviting anyone. Export/delete of an individual learner is an existing app feature (account export/delete) and works through the gate.

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
| Deploy workflow logic against mocks: wrong branch, missing/failed CI, missing credentials, backup rule, Railway API errors, failed/timed-out deployment, health timeout, wrong commit, duplicate/in-flight deployment, smoke failures, no credentials in logs (`npm run test:deploy`); workflow syntax (actionlint) | Everything in "Railway Hobby limitations and unverified Railway details": real API schema, project-token permissions, exact-SHA deploy with auto-deploy off, first live run |
