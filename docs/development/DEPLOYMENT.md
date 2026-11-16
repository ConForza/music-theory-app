# Deployment notes: client addresses and rate limiting

Status: development-stage guidance added in the Brief 02 follow-up. Brief 11 owns the full release and deployment plan.

## Who is calling? (`MTP_TRUST_PROXY_HOPS`)

The sign-in and registration limiters need an address for the caller. The only address a client cannot choose is the one
the operating system reports for the TCP connection, so that is the default.

* **No reverse proxy (default, `MTP_TRUST_PROXY_HOPS=0` or unset).** The limiter keys on the connection's peer address.
  `x-forwarded-for` is ignored completely, so sending a different value on every request changes nothing.
* **Behind reverse proxies you operate.** Behind a proxy every connection comes from the proxy, so all learners would
  share one bucket. Set `MTP_TRUST_PROXY_HOPS` to the **number of proxies in front of the API** (a CDN plus a load
  balancer is 2). Each proxy appends the address it received the request from, so the real client is the entry that many
  positions from the **right** of `x-forwarded-for`. Anything a client prepends sits to the left and is never read. If the
  header is shorter than expected or the entry is not an IP address, the limiter falls back to the peer address.
* **Required proxy behaviour.** Every trusted proxy must *append* to `x-forwarded-for` (nginx `$proxy_add_x_forwarded_for`,
  Caddy and most cloud load balancers do by default), and the API must not be reachable except through them (firewall
  or private network). If the API is also directly reachable, a client can skip the proxy and the hop count is wrong.
  Set `MTP_TRUST_PROXY_HOPS` to match the real topology; too high a number lets a client pick the entry, too low
  groups everyone behind the proxy's address.
* IPv4-mapped IPv6 addresses count as the IPv4 address, and other IPv6 addresses are grouped by their /64, so one
  household cannot mint unlimited keys from its delegated prefix.

Also set `MTP_SECURE_COOKIES=1` when the site is served over HTTPS. That setting is what declares the deployment HTTPS: cookies become
`Secure`, the public origin used by the same-origin check becomes `https://<host>`, and `Strict-Transport-Security` is sent.
`x-forwarded-proto` is **not** trusted by default (a client can send it); it is read only when `MTP_TRUST_PROXY_HOPS` is set, and then only
the last entry, the one written by the proxy nearest the app. **Behind an HTTPS proxy you must set `MTP_SECURE_COOKIES=1`** (or
`MTP_TRUST_PROXY_HOPS`), otherwise sign-in and every other POST is refused with 403 `bad_origin`, because the browser's `Origin` is `https://…`
and the app believes it is serving `http://…`. Before this change the app believed any `x-forwarded-proto` it was sent.

## What the limits are

| Endpoint | Key | Limit (per process, 15-minute fixed window) |
| --- | --- | --- |
| `POST /api/auth/guest` | caller address | 60 (override: `MTP_GUEST_CREATIONS_PER_15_MIN`) |
| `POST /api/auth/register` | caller address | 20 |
| `POST /api/auth/login` | email | 10 |
| `POST /api/auth/login` | caller address | 60 |

Registration allows 20 per address so a classroom or household sharing one address is not locked out, while still
capping automated account creation from a single source. A retried registration from the learner's own session counts
against the sign-in limiter for that email, because it checks a password.

## Is the per-process limiter adequate now?

For the current development stage, yes: one process, one SQLite file, no public audience. It is **not** adequate for
production:

1. Counters live in memory, so a restart resets them and several instances each allow the full quota.
2. A fixed window allows a burst of twice the quota across a window boundary.
3. Per-address limits do not stop a distributed attacker; per-email sign-in limits can be used to lock a victim out for a
   window (a soft denial of service).

Production requirements (to be scheduled in Brief 11): a shared store (Redis or the database) behind the same
`RateLimiter` interface; a sliding window or token bucket; progressive back-off and CAPTCHA/step-up for repeated
failures rather than hard per-email lockout; alerting on 429 spikes; and edge rate limiting at the proxy or CDN as a
first layer.

## Start-up: review question pools (Brief 11)

Before it starts listening, the server samples the review question pool of every concept (`ReviewService.warmPools`, called from `main.ts`).
With the full Grades 1-5 content this takes roughly 25 to 40 seconds on one core, and the log line `Review pools ready: N candidates in S s`
marks the end of it. Allow for it in health checks and rolling deploys: the port is not open until it has finished.

It is done at start-up because it used to happen inside a learner's request: the first `GET /api/review` from a learner with many completed
lessons blocked the server's single thread for 15 to 25 seconds after every restart, stalling every other learner (release audit, issue #19, F3).
`MTP_WARM_POOLS=0` skips it for local development; the pools are then filled on first use, with that cost.

Starting a practice examination still plans its paper on the same single thread (about 0.5 to 3 s each). That is acceptable for individual
learners; a whole class starting papers at the same moment will queue, so do not rely on it for classroom use until planning yields or moves
off the request thread.

## Guest accounts (final release hardening)

`POST /api/auth/guest` creates an account with no email or password, so it is limited per caller address: 60 new guests per 15 minutes
(room for a class or a household behind one address; the audit's loop created 300 in 1.4 s). A caller who already has a session gets it
back and is not counted. Over the limit the answer is HTTP 429 `{"error":{"code":"rate_limited",…}}`, the same shape as the sign-in limiters.

Limits of this design, the same as for the other limiters above: counters are per process and in memory (a restart resets them, and N
processes allow N times the quota); the window is fixed; a distributed attacker with many addresses is not stopped. A school with more than
60 learners behind one address who all start as guests within 15 minutes will see the limit: raise `MTP_GUEST_CREATIONS_PER_15_MIN` for that
deployment, or have learners register. Edge rate limiting at the proxy or CDN remains the recommended first layer for a public launch.

## Security headers: which layer sets what

By default **the app sets all of them on every response** (API, web app, assets, errors), so they are present with or without a proxy:

| Header | Value | Set by |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` | app |
| `X-Content-Type-Options` | `nosniff` | app |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | app |
| `X-Frame-Options` | `DENY` (with `frame-ancestors 'none'`) | app |
| `Cross-Origin-Opener-Policy` | `same-origin` | app |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | app |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | app, **only when `MTP_SECURE_COOKIES=1`** |
| TLS certificates, HTTP to HTTPS redirect | - | the reverse proxy or host (the app does neither) |

There is no `unsafe-inline` and no `unsafe-eval`. The one inline script (the theme snippet in `index.html`, which avoids a flash of the wrong
theme) is allowed by its SHA-256 hash, computed from the built file at start-up, so changing the snippet needs no manual step. The music
font is registered with the Font Loading API instead of an injected `<style>` element for the same reason.

If you prefer the reverse proxy to own the headers, set `MTP_SECURITY_HEADERS=proxy`: the app then sends none, so the two layers can never
send conflicting policies. In that case the proxy must send the whole table above, with the script hash taken from the built `index.html`
(`inlineScriptHashes` in `server.ts` prints it). Do not set `proxy` unless the proxy is actually configured: there is no check that it is.

`includeSubDomains` in HSTS assumes every subdomain of the production host is HTTPS. Confirm that for the real domain before launch; HSTS
is hard to undo once browsers have seen it. `preload` is deliberately not sent.

## Start-up, readiness and shutdown (final release hardening)

**No hosting configuration exists in this repository** (no Dockerfile, Procfile, compose file, platform manifest, proxy configuration or
service unit), so nothing about the production host could be verified. What the application itself does is tested
(`packages/api/test/release-hardening.test.ts`) and is as follows.

| Item | Behaviour |
|---|---|
| Start command | `npm start` (runs `node --import tsx src/main.ts` in `packages/api`), after `npm ci && npm run build` |
| Port | `PORT` (default 8787), all interfaces |
| Data | one SQLite file at `MTP_DB`; it must be on persistent storage and backed up |
| Warm-up | review question pools are sampled **before** the port opens: measured 38.0, 39.1 and 40.8 s (three runs, 4-core machine, full Grades 1-5 content, 376 candidates), about 190 MB resident memory |
| Readiness | the port is closed until warm-up and housekeeping have finished, so "TCP connect succeeds" or `GET /api/health` returning 200 means ready. There is no separate liveness state |
| Failed start | if warm-up throws, or samples nothing, the process prints the reason and **exits with status 1 without opening the port**. It never starts half-warmed |
| First request after start | first `GET /api/review` over HTTP after a warmed start: 55 ms for a learner with Grades 1-4 complete and Grade 5 in progress, 33 ms for a learner with Grades 1-5 complete (it was 15 to 25 s before PR #20) |
| Shutdown | on `SIGTERM` or `SIGINT`: stop accepting connections, let requests in flight finish (up to 10 s), close the database, exit 0. Measured 0.02-0.03 s when idle |
| Processes | exactly one. SQLite and the in-memory limiters assume a single process; do not run two against one database file |

What the host must provide, **to be confirmed by the owner for the chosen provider**:

1. **Start-up grace of at least 60 seconds** (90 s on a small shared CPU) before health checks count as failures. Many platforms default to
   far less; with a shorter grace the process is killed during warm-up and restarts forever.
2. **Stop grace of at least 15 seconds** between `SIGTERM` and `SIGKILL`.
3. **Deploys cause downtime of about the warm-up time** unless the host keeps the old process serving until the new one is ready. That is
   only safe if the two never write the same SQLite file at once; with one file the practical choice is a short maintenance window, or a
   host that starts the new process, waits for readiness, then stops the old one, accepting a few seconds in which both have the file open
   (WAL mode tolerates this; the in-memory limiters and review pools are simply rebuilt).
4. **A restart policy** that restarts on a non-zero exit, with back-off, and alerts if start-up fails repeatedly.
5. HTTPS termination, and the two settings in "Who is calling?" above.

`MTP_WARM_POOLS=0` exists for local development only. Do not use it to make production start faster: it moves the same work into
learners' requests, which is the 15 to 25 second stall that PR #20 removed. The server prints a warning when it is set.
