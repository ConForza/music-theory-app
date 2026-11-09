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

Also set `MTP_SECURE_COOKIES=1` when served over HTTPS and `x-forwarded-proto` is set by the proxy.

## What the limits are

| Endpoint | Key | Limit (per process, 15-minute fixed window) |
| --- | --- | --- |
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
