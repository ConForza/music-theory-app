/**
 * Private-preview gate (issue #24, PWA brief): a browser sign-in form and a server-validated preview session replace the HTTP Basic
 * challenge, so an installed Home Screen app is not asked for preview credentials on every launch. Everything stays invite-only.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb, type Db } from "../src/db.ts";
import { PREVIEW_COOKIE, PREVIEW_MAX_DAYS, PREVIEW_SESSION_DAYS, PUBLIC_INSTALL_PATHS, createPreviewGate, newInvite, safeNext } from "../src/preview-gate.ts";
import { createHttpServer } from "../src/server.ts";
import { sharedCourse } from "./helpers.ts";

const dir = mkdtempSync(join(tmpdir(), "mtp-preview-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
// A stand-in for the built web app: the page, an asset and the installation metadata.
const web = join(dir, "web");
mkdirSync(join(web, "assets"), { recursive: true });
mkdirSync(join(web, "icons"), { recursive: true });
writeFileSync(join(web, "index.html"), "<!doctype html><title>app</title><p>SECRET COURSE PAGE</p>");
writeFileSync(join(web, "assets", "app.js"), "console.log('protected bundle')");
writeFileSync(join(web, "manifest.webmanifest"), JSON.stringify({ name: "Music Theory Path" }));
for (const p of PUBLIC_INSTALL_PATHS) if (p !== "/manifest.webmanifest") writeFileSync(join(web, p), "icon");

const basic = (n: string, p: string) => "Basic " + Buffer.from(`${n}:${p}`).toString("base64");
const DAY = 86400_000;
const alice = newInvite("alice");
const bob = newInvite("bob");

interface Srv {
  base: string;
  db: Db;
  get: (path: string, init?: RequestInit) => Promise<Response>;
  signIn: (name: string, password: string, extra?: { next?: string; cookie?: string; origin?: string }) => Promise<Response>;
}

/** One running server ("deployment") over a given database, with a given MTP_PREVIEW_ACCESS. */
async function withServer<T>(access: string | undefined, fn: (s: Srv) => Promise<T>, opts: { db?: Db; now?: () => Date } = {}): Promise<T> {
  const db = opts.db ?? openDb(":memory:");
  const gate = createPreviewGate(access, { db, secureCookies: true, ...(opts.now ? { now: opts.now } : {}) });
  const server = createHttpServer(createApp({ db, course: sharedCourse(), secureCookies: true }), web, { gate, https: true });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  const get = (p: string, init: RequestInit = {}) => fetch(base + p, { redirect: "manual", ...init });
  const signIn: Srv["signIn"] = (name, password, extra = {}) =>
    get("/preview/signin", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        // The server is declared HTTPS, so its own origin is https://<host>.
        origin: extra.origin ?? `https://127.0.0.1:${port}`,
        ...(extra.cookie ? { cookie: extra.cookie } : {}),
      },
      body: new URLSearchParams({ username: name, password, ...(extra.next ? { next: extra.next } : {}) }).toString(),
    });
  try {
    return await fn({ base, db, get, signIn });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
const previewCookieOf = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith(`${PREVIEW_COOKIE}=`));
const pair = (setCookie: string | undefined) => setCookie!.split(";")[0]!;

describe("uninvited visitors", () => {
  it("cannot read any page, asset or API route; pages go to the sign-in form, nothing asks for HTTP Basic", async () => {
    await withServer(`${alice.entry},${bob.entry}`, async ({ get }) => {
      for (const p of ["/", "/learn", "/lesson/G1-U1-L01", "/practice/s.scales"]) {
        const r = await get(p);
        expect(r.status, p).toBe(303);
        expect(r.headers.get("location"), p).toBe(`/preview/signin?next=${encodeURIComponent(p)}`);
        expect(r.headers.get("www-authenticate"), p).toBeNull();
        expect(await r.text()).not.toContain("SECRET");
      }
      for (const p of ["/assets/app.js", "/index.html", "/robots.txt", "/sw.js", "/offline.html"]) {
        const r = await get(p);
        expect(r.status, p).toBe(401);
        expect(r.headers.get("www-authenticate"), p).toBeNull();
        expect(await r.text()).not.toMatch(/SECRET|protected bundle/);
      }
      for (const [m, p] of [["GET", "/api/me"], ["GET", "/api/course"], ["GET", "/api/review"], ["POST", "/api/auth/guest"], ["POST", "/api/auth/register"], ["POST", "/api/auth/login"], ["POST", "/api/health"], ["HEAD", "/api/health"]] as const) {
        const r = await get(p, { method: m, headers: m === "POST" ? { "content-type": "application/json" } : {}, body: m === "POST" ? "{}" : undefined });
        expect(r.status, `${m} ${p}`).toBe(401);
        expect(r.headers.get("x-robots-tag")).toBe("noindex");
        expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
        if (m !== "HEAD") expect((await r.json()).error.code).toBe("preview_required");
      }
    });
  });

  it("can reach only the healthcheck, the sign-in page and the installation metadata", async () => {
    await withServer(alice.entry, async ({ get }) => {
      expect((await get("/api/health")).status).toBe(200);
      const page = await get("/preview/signin?next=%2Flearn");
      expect(page.status).toBe(200);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(page.headers.get("content-security-policy")).toContain("form-action 'self'");
      const html = await page.text();
      expect(html).toContain('autocomplete="username"');
      expect(html).toContain('autocomplete="current-password"');
      expect(html).toContain('name="next" value="/learn"');
      expect(html).not.toMatch(/<script/i); // works under the CSP with no script at all
      expect((await get("/preview/style.css")).headers.get("content-type")).toMatch(/text\/css/);
      for (const p of PUBLIC_INSTALL_PATHS) {
        const r = await get(p);
        expect(r.status, p).toBe(200);
        expect(r.headers.get("set-cookie"), p).toBeNull();
      }
      expect((await get("/manifest.webmanifest")).headers.get("content-type")).toBe("application/manifest+json");
    });
  });

  it("cannot use the installation metadata paths to reach anything else", async () => {
    await withServer(alice.entry, async ({ get }) => {
      for (const p of ["/icons/../index.html", "/icons/%2e%2e/index.html", "/icons/%2E%2E/assets/app.js", "/manifest.webmanifest/", "/manifest.webmanifest/../api/me", "/icons/", "/icons/icon-192.png/..%2f..%2findex.html", "/apple-touch-icon.png%00", "/ICONS/icon-192.png"]) {
        const r = await get(p);
        expect([303, 401, 404], p).toContain(r.status);
        expect(await r.text(), p).not.toMatch(/SECRET|protected bundle/);
      }
      expect((await get("/manifest.webmanifest", { method: "POST" })).status).toBe(401);
    });
  });
});

describe("tester sign-in", () => {
  it("the invitation's name and password open the preview once; the preview cookie is HttpOnly, Secure and SameSite=Lax", async () => {
    await withServer(`${alice.entry},${bob.entry}`, async ({ get, signIn, db }) => {
      const r = await signIn("alice", alice.password, { next: "/learn" });
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toBe("/learn");
      const set = previewCookieOf(r)!;
      expect(set).toMatch(/HttpOnly/);
      expect(set).toMatch(/Secure/);
      expect(set).toMatch(/SameSite=Lax/);
      // The cookie lasts to the absolute limit; the server's 60-day idle window decides whether it still works.
      expect(Number(/Max-Age=(\d+)/.exec(set)![1])).toBe(PREVIEW_MAX_DAYS * 86400);
      const token = pair(set).split("=")[1]!;
      // Stored only as a hash, with no learner identity.
      const rows = db.prepare("SELECT * FROM preview_sessions").all() as Array<Record<string, string>>;
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain(token);
      expect(rows[0]!.tester).toBe("alice");
      const cookie = pair(set);
      const page = await get("/learn", { headers: { cookie } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("SECRET COURSE PAGE");
      expect((await get("/assets/app.js", { headers: { cookie } })).status).toBe(200);
      // Already signed in: the sign-in page sends the tester on.
      expect((await get("/preview/signin?next=%2Fprogress", { headers: { cookie } })).headers.get("location")).toBe("/progress");
    });
  });

  it("wrong, malformed or swapped credentials are refused without a session", async () => {
    await withServer(`${alice.entry},${bob.entry}`, async ({ signIn, db }) => {
      for (const [n, p] of [["alice", bob.password], ["alice", "x"], ["mallory", alice.password], ["alice", ""], ["", ""], ["alice", alice.entry.split(":")[1]!]]) {
        const r = await signIn(n!, p!);
        expect(r.status, `${n}`).toBe(401);
        expect(previewCookieOf(r)).toBeUndefined();
        expect(await r.text()).toContain("don&#39;t match an invitation");
      }
      expect((db.prepare("SELECT COUNT(*) AS c FROM preview_sessions").get() as { c: number }).c).toBe(0);
    });
  });

  it("refuses a sign-in posted from another site, or not as a form", async () => {
    await withServer(alice.entry, async ({ get, signIn }) => {
      expect((await signIn("alice", alice.password, { origin: "https://evil.example" })).status).toBe(403);
      expect((await signIn("alice", alice.password, { origin: "null" })).status).toBe(403);
      const json = await get("/preview/signin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "alice", password: alice.password }) });
      expect(json.status).toBe(415);
    });
  });

  it("is rate limited per tester name", async () => {
    await withServer(alice.entry, async ({ signIn }) => {
      let last = 0;
      for (let i = 0; i < 25; i++) last = (await signIn("alice", "wrong")).status;
      expect(last).toBe(429);
      expect((await signIn("alice", alice.password)).status).toBe(429); // even the right password waits
    });
  });

  it("only ever returns to a page on this site", () => {
    expect(safeNext("/learn?x=1")).toBe("/learn?x=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "/preview/signin", "/api/me", "", null, "learn", "/a\nb", "/" + "x".repeat(600)]) expect(safeNext(bad as string)).toBe("/");
  });

  it("signing in again replaces the device's previous preview session (no fixation)", async () => {
    await withServer(alice.entry, async ({ get, signIn }) => {
      const first = pair(previewCookieOf(await signIn("alice", alice.password)));
      const second = pair(previewCookieOf(await signIn("alice", alice.password, { cookie: first })));
      expect(second).not.toBe(first);
      expect((await get("/learn", { headers: { cookie: first } })).status).toBe(303);
      expect((await get("/learn", { headers: { cookie: second } })).status).toBe(200);
    });
  });

  it("leaving the preview ends the session", async () => {
    await withServer(alice.entry, async ({ get, signIn, base }) => {
      const cookie = pair(previewCookieOf(await signIn("alice", alice.password)));
      const out = await get("/preview/signout", { method: "POST", headers: { cookie, origin: base.replace("http:", "https:") } });
      expect(out.status).toBe(303);
      expect(previewCookieOf(out)).toMatch(/Max-Age=0/);
      expect((await get("/learn", { headers: { cookie } })).status).toBe(303);
    });
  });

  it("scripts may still send the same credentials as an Authorization: Basic header", async () => {
    await withServer(alice.entry, async ({ get }) => {
      expect((await get("/api/course", { headers: { authorization: basic("alice", alice.password) } })).status).toBe(200);
      expect((await get("/api/course", { headers: { authorization: basic("alice", "nope") } })).status).toBe(401);
      expect((await get("/api/course", { headers: { authorization: "Bearer abc" } })).status).toBe(401);
    });
  });
});

describe("persistence and revocation", () => {
  it("a preview session survives a redeploy (new process, same database and invitations)", async () => {
    const db = openDb(join(dir, "redeploy.sqlite"));
    const cookie = await withServer(alice.entry, async ({ signIn }) => pair(previewCookieOf(await signIn("alice", alice.password))), { db });
    await withServer(alice.entry, async ({ get }) => {
      expect((await get("/learn", { headers: { cookie } })).status).toBe(200);
    }, { db });
  });

  it("removing a tester's entry ends their sessions on the next deploy and deletes them; other testers are unaffected", async () => {
    const db = openDb(":memory:");
    const [a, b] = await withServer(`${alice.entry},${bob.entry}`, async ({ signIn }) => [pair(previewCookieOf(await signIn("alice", alice.password))), pair(previewCookieOf(await signIn("bob", bob.password)))], { db });
    await withServer(bob.entry, async ({ get, signIn }) => {
      expect((await get("/learn", { headers: { cookie: a } })).status).toBe(303);
      expect((await get("/api/course", { headers: { cookie: a } })).status).toBe(401);
      expect((await signIn("alice", alice.password)).status).toBe(401);
      expect((await get("/learn", { headers: { cookie: b } })).status).toBe(200);
    }, { db });
    expect((db.prepare("SELECT tester FROM preview_sessions").all() as Array<{ tester: string }>).map((r) => r.tester)).toEqual(["bob"]);
  });

  it("re-issuing a tester's password (same name, new entry) ends the sessions made with the old one", async () => {
    const db = openDb(":memory:");
    const old = await withServer(alice.entry, async ({ signIn }) => pair(previewCookieOf(await signIn("alice", alice.password))), { db });
    const fresh = newInvite("alice");
    await withServer(fresh.entry, async ({ get }) => {
      expect((await get("/learn", { headers: { cookie: old } })).status).toBe(303);
    }, { db });
  });

  it("a session is renewed by use (server-side, at most daily), ends after 60 idle days, and never outlives 180 days", async () => {
    const db = openDb(":memory:");
    let t = Date.now();
    const now = () => new Date(t);
    await withServer(alice.entry, async ({ get, signIn }) => {
      const cookie = pair(previewCookieOf(await signIn("alice", alice.password)));
      expect((await get("/learn", { headers: { cookie } })).headers.getSetCookie()).toHaveLength(0); // fresh: nothing to renew
      t += 30 * DAY;
      // Renewal is server-side only: no response ever carries a renewal cookie (review P2), and the session still works 85 days in.
      for (const p of ["/assets/app.js", "/learn", "/preview/signin?next=%2Flearn"]) expect((await get(p, { headers: { cookie } })).headers.getSetCookie(), p).toHaveLength(0);
      t += 55 * DAY; // 85 days after sign-in, 55 after the last use: still inside the renewed idle window
      expect((await get("/learn", { headers: { cookie } })).status).toBe(200);
      t += (PREVIEW_SESSION_DAYS + 1) * DAY; // unused for longer than the idle window
      expect((await get("/learn", { headers: { cookie } })).status).toBe(303);
      // Used every week: still ends at the absolute limit.
      const c2 = pair(previewCookieOf(await signIn("alice", alice.password)));
      const start = t;
      while (t < start + (PREVIEW_MAX_DAYS - 7) * DAY) {
        t += 7 * DAY;
        expect((await get("/api/course", { headers: { cookie: c2 } })).status).toBe(200);
      }
      t = start + PREVIEW_MAX_DAYS * DAY + 1000;
      expect((await get("/api/course", { headers: { cookie: c2 } })).status).toBe(401);
    }, { db, now });
  });

  it("no valid entries means nobody gets in; spoofed forwarding headers change nothing", async () => {
    await withServer("garbage,alice:short", async ({ get, signIn }) => {
      expect(createPreviewGate("garbage", { db: openDb(":memory:") }).testers).toBe(0);
      expect((await get("/", { headers: { "x-forwarded-for": "127.0.0.1", "x-forwarded-proto": "https", host: "healthcheck.railway.app" } })).status).toBe(303);
      expect((await signIn("alice", "short")).status).toBe(401);
      expect((await get("/api/health")).status).toBe(200);
    });
  });
});

describe("preview access and learner accounts stay separate", () => {
  it("a preview session signs no learner in, a learner session opens no preview, and learner sign-out keeps the preview", async () => {
    await withServer(alice.entry, async ({ get, signIn, base }) => {
      const preview = pair(previewCookieOf(await signIn("alice", alice.password)));
      expect((await get("/api/me", { headers: { cookie: preview } })).status).toBe(401);
      const origin = base.replace("http:", "https:");
      const reg = await get("/api/auth/register", { method: "POST", headers: { cookie: preview, origin, "content-type": "application/json" }, body: JSON.stringify({ email: "t@example.com", password: "correct horse", displayName: "t" }) });
      expect(reg.status).toBe(200);
      const learner = reg.headers.getSetCookie().find((c) => c.startsWith("mtp_session="))!.split(";")[0]!;
      expect(reg.headers.getSetCookie().some((c) => c.startsWith(PREVIEW_COOKIE))).toBe(false);
      // The learner cookie alone does not pass the gate.
      expect((await get("/api/me", { headers: { cookie: learner } })).status).toBe(401);
      expect((await (await get("/api/me", { headers: { cookie: learner } })).json()).error.code).toBe("preview_required");
      const both = `${preview}; ${learner}`;
      expect((await (await get("/api/me", { headers: { cookie: both } })).json()).user.email).toBe("t@example.com");
      await get("/api/auth/logout", { method: "POST", headers: { cookie: both, origin, "content-type": "application/json" }, body: "{}" });
      expect((await get("/api/me", { headers: { cookie: both } })).status).toBe(401); // learner signed out...
      expect((await get("/learn", { headers: { cookie: preview } })).status).toBe(200); // ...preview kept
    });
  });
});

describe("review follow-ups", () => {
  it("a sign-in form over the transport limit is answered 413 on both sides of it, never 500", async () => {
    await withServer(alice.entry, async ({ get, base }) => {
      for (const size of [4100, 9000, 200_000]) {
        const r = await get("/preview/signin", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: base.replace("http:", "https:") }, body: `username=${"a".repeat(size)}` }).catch(() => null);
        // A very large body may also be cut off by the server closing the connection after its 413.
        if (size < 100_000) expect(r?.status, String(size)).toBe(413);
        else if (r) expect(r.status, String(size)).toBe(413);
      }
    });
  });

  it("protected static files are never shared-cacheable: private, revalidated through the gate, 304 when unchanged", async () => {
    await withServer(alice.entry, async ({ get, signIn }) => {
      const cookie = pair(previewCookieOf(await signIn("alice", alice.password)));
      const first = await get("/assets/app.js", { headers: { cookie } });
      expect(first.status).toBe(200);
      expect(first.headers.get("cache-control")).toBe("private, no-cache");
      const etag = first.headers.get("etag")!;
      expect(etag).toMatch(/^W\//);
      const again = await get("/assets/app.js", { headers: { cookie, "if-none-match": etag } });
      expect(again.status).toBe(304);
      // Without preview access the revalidation is refused, so no cached copy is confirmed.
      expect((await get("/assets/app.js", { headers: { "if-none-match": etag } })).status).toBe(401);
    });
  });

  it("the preview status endpoint tells the app whether to offer 'leave the preview', and nothing about the tester", async () => {
    await withServer(alice.entry, async ({ get, signIn }) => {
      const out = await get("/preview/session");
      expect(out.status).toBe(401);
      expect(await out.json()).toEqual({ preview: true, signedIn: false, viaSession: false, audience: "testers" });
      const cookie = pair(previewCookieOf(await signIn("alice", alice.password)));
      const body = await (await get("/preview/session", { headers: { cookie } })).json();
      expect(body).toEqual({ preview: true, signedIn: true, viaSession: true, audience: "testers" });
      expect(JSON.stringify(body)).not.toContain("alice");
    });
  });

  it("expired preview sessions are removed by the daily housekeeping", async () => {
    const { runRetention, retentionPolicyFromEnv } = await import("../src/retention.ts");
    const db = openDb(":memory:");
    let t = Date.now();
    await withServer(alice.entry, async ({ signIn }) => {
      await signIn("alice", alice.password);
    }, { db, now: () => new Date(t) });
    t += (PREVIEW_SESSION_DAYS + 1) * DAY;
    expect(runRetention(db, retentionPolicyFromEnv({}), { now: new Date(t) }).expiredPreviewSessionsRemoved).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM preview_sessions").get() as { n: number }).n).toBe(0);
  });
});

describe("re-review: preview renewal only after a successful response", () => {
  it("a rejected (cross-origin) or failed request does not extend an aged preview session; a successful one does", async () => {
    const db = openDb(":memory:");
    let t = Date.now();
    await withServer(alice.entry, async ({ get, signIn }) => {
      const cookie = pair(previewCookieOf(await signIn("alice", alice.password)));
      const token = cookie.split("=")[1]!;
      const exp = () => (db.prepare("SELECT expires_at FROM preview_sessions WHERE token_hash = ?").get(createHash("sha256").update(token).digest("hex")) as { expires_at: string }).expires_at;
      t += 20 * DAY;
      const before = exp();
      // Cross-origin sign-in post: 403 from the gate.
      expect((await signIn("alice", alice.password, { cookie, origin: "https://evil.example" })).status).toBe(403);
      // An API request that fails (unknown route) and one refused for its method.
      expect((await get("/api/no-such-thing", { headers: { cookie } })).status).toBe(404);
      expect((await get("/api/health", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" })).status).toBe(405);
      // The sign-in page visited while signed in (a redirect, nothing served by the app).
      expect((await get("/preview/signin", { headers: { cookie } })).status).toBe(303);
      expect(exp()).toBe(before);
      expect((await get("/learn", { headers: { cookie } })).status).toBe(200);
      expect(new Date(exp()).getTime()).toBeGreaterThan(new Date(before).getTime() + 15 * DAY);
    }, { db, now: () => new Date(t) });
  });
});
