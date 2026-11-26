# Railway private preview: setup and runbook (issue #24)

**Status: prepared, not deployed.** Nothing here has been provisioned. No public domain, no deploy, no invitations. Every step marked
**OWNER** needs the owner; do the steps in order. Hosting is Railway Hobby (decided 16 Nov 2026); other hosts are out of scope.

## What lives where

| Item | Where | Value |
|---|---|---|
| Build / start / healthcheck / restart policy | **Code**: `railway.json` | `npm run build` (Railpack runs `npm ci` first), `npm start`, `GET /api/health`, timeout 300 s, restart on failure (5 tries) |
| `tsx` available at runtime | **Code**: `packages/api/package.json` | `tsx` is a runtime dependency (the start script is `node --import tsx`) |
| Access gate, storage guard | **Code** | `preview-gate.ts`, `config.ts#railwayProblem`; on Railway the app **refuses to start** without the gate, a volume, or `MTP_DB` inside it |
| One service, one replica, region, volume `/data`, auto-deploy off | **Railway service settings** (OWNER) | see checklist |
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
8. **Do not generate a domain yet.** Without public networking the service is reachable only inside Railway, which is the safe default. Deploy once (manual "Deploy"), check the deploy logs for `Review pools ready`, `Preview access gate ON: N invited tester(s)` and the healthcheck passing.
9. **Approval point:** when you decide to open it to testers, generate the Railway domain (HTTPS is provided by Railway), then set `MTP_ALLOWED_ORIGINS=https://<that-domain>` and redeploy. Verify forwarded headers before touching `MTP_TRUST_PROXY_HOPS` (below).
10. **Backups**: Volume → Backups → enable the schedule you want (manual and scheduled backups are Railway features; check the plan's retention). Also take an app-level backup (below) before every deploy that includes a migration.

## Testers: invite and revoke

The gate is HTTP Basic authentication in front of **every** route (web app, assets, `/robots.txt`, all `/api/*`), separate from learner accounts. Only
`GET /api/health` is open (read-only, returns `{ok, curriculumVersion}`), which is what Railway's healthcheck needs; guest, registration, login and
student routes are not reachable without credentials. Responses carry `X-Robots-Tag: noindex`.

* **Invite**: `npm run preview:invite -w @mtp/api -- alice` prints a random 192-bit password (show it to the tester once, via a private channel) and an entry `alice:<sha256>`. Append the entry to `MTP_PREVIEW_ACCESS` (comma-separated) in Railway and deploy. Only hashes are stored; no credentials are in Git, and none ever go in a URL.
* **Revoke**: remove that tester's entry and deploy. Credentials stop working when the new process starts (a deploy restarts the service; learner sessions inside the app are unaffected, but the tester can no longer reach it).
* **Adults and internal testers only.** No children until the age/privacy notice, consent arrangements and data-location decisions are approved. No production WMF data.
* Browsers cache Basic credentials until closed; use a private window to test revocation.

Message to send testers with their password:

> This is a private, invitation-only preview of Music Theory Path. The course content is **draft** and awaiting teacher sign-off; it is not an
> official ABRSM or exam product and may contain errors. Please do not share the address or your password, and do not enter real personal data
> (use a made-up name and a throwaway email). Your test account and progress may be deleted at any time. Hosting is in Railway's EU West
> (Amsterdam) region.

## Deploys, maintenance windows and rollback

**One writer rule**: the old process must exit before the new one writes `/data/mtp.sqlite`. Railway documents that a service with a volume does not run
two active deployments on the volume, so expect downtime of roughly the start-up warm-up (see below). Verify this on the first real deploy (the logs
should show the old deployment stopping before the new `Review pools ready`), and keep overlap at 0.

* **Normal deploy**: announce a short window; take an app backup; click Deploy on the chosen commit; watch the logs until the healthcheck passes; run the smoke test.
* **SIGTERM**: the app stops accepting connections, finishes requests in flight (up to 10 s), closes the database, exits 0. Draining is set to 20 s so it is not killed first.
* **Start-up failure**: the app exits 1 *without opening the port* (warm-up failure, missing volume, missing gate, bad `MTP_DB`); the deploy fails its healthcheck and Railway restarts up to 5 times. Read the log line. Fix the variable or redeploy the previous good deployment. Nothing half-warmed ever serves.
* **Deployment rollback (code/config)**: Railway → Deployments → redeploy the previous successful deployment. This never touches `/data`, so learner data is **not** reverted. Caveat: migrations are forward-only, so rolling back to code older than the database's migrations is only safe if no migration shipped in between; if one did, prefer fixing forward. **Migration 010 (flexible learning) is one of these:** code from before it ignores `lesson_progress.explored` and would open guided steps after lessons explored ahead; see `docs/architecture/FLEXIBLE_LEARNING.md` §5a.
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
before risky changes. **Restore** (two writers corrupt writes): stop the service first (dashboard: remove/stop the active deployment), then run in a
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

1. Uninvited: `curl -i https://<domain>/`, `/api/me`, `POST /api/auth/guest` → 401; `/api/health` → 200 and nothing else open. Invited: the browser prompts; login/guest works; a revoked entry is refused after redeploy.
2. HTTPS and headers: browser dev tools show CSP, `X-Frame-Options: DENY`, HSTS; a POST from the real origin succeeds; no console CSP violations; Bravura music font, stave rendering and WebAudio sound work.
3. iPhone and desktop: an early lesson and a Grade 5 lesson, review, placement, practice/mock exam, explanation and marking, export/delete, logout.
4. Persistence: complete a lesson, trigger a redeploy, confirm the account and progress remain; check the deploy log shows the old process stopped first.
5. Backup: take an app backup, verify it, restore it into a **disposable** copy (`restore` to a different path) and open it.
6. Healthcheck timing: log the exact Railway start-up time and the memory peak.

## Confirmed vs unverified

| Confirmed (tested in this repo) | Unverified, needs Railway / owner |
|---|---|
| Gate denies web app, assets, all API incl. guest/register/login, HEAD/POST on health; allows only `GET /api/health`; fails closed; spoofed headers ignored | Railpack's build installs devDependencies for the Vite build and keeps `tsx` at runtime (`tsx` is now a runtime dependency to cover the latter) |
| App refuses to start on Railway without volume / `MTP_DB` on it / gate | Field names in `railway.json` against Railway's current schema (dashboard shows config-as-code overrides) |
| Warm-up then listen; 200 only when ready; SIGTERM drains and exits 0; WAL files checkpointed away on clean stop | Hobby warm-up time, memory and CPU; healthcheck host handling by Railway |
| `VACUUM INTO` backup of an uncheckpointed WAL database, verification, restore, refusal of corrupt backups | Region available on Hobby; volume placement; volume permissions (`RAILWAY_RUN_UID`) |
| Origin check: wrong origin 403, right HTTPS origin 200 under `MTP_SECURE_COOKIES=1` | Overlap 0 / draining 20 s variables honoured; no concurrent writers during cutover on Railway |
| | Railway forwarding behaviour and correct `MTP_TRUST_PROXY_HOPS` |
| | Volume backup schedule/retention on Hobby; number of replicas stays 1 |
