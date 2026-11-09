import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.ts";
import { clientKey, normaliseIp } from "../src/net.ts";
import { openDb } from "../src/db.ts";
import { Client, email, setup, sharedCourse } from "./helpers.ts";

/** A client whose requests arrive from a given TCP peer, optionally with a forged x-forwarded-for. */
function from(app: ReturnType<typeof setup>["app"], peer: string) {
  const c = new Client(app);
  const call = c.call.bind(c);
  c.app = { ...app, fetch: (req: Request) => app.fetch(req, { remoteAddress: peer }) } as typeof app;
  void call;
  return c;
}
const reg = (c: Client, n: string, headers: Record<string, string> = {}) =>
  c.call("POST", "/api/auth/register", { email: email(n), password: "correct horse battery", displayName: n }, headers);

afterEach(() => vi.useRealTimers());

describe("client identity for rate limiting", () => {
  it("ignores x-forwarded-for unless a trusted proxy count is configured", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9" });
    expect(clientKey(h, "10.0.0.5", 0)).toBe("10.0.0.5");
    expect(clientKey(new Headers(), undefined, 0)).toBe("unknown");
  });
  it("with one trusted proxy takes the rightmost entry, never the client-prepended ones", () => {
    const h = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7" });
    expect(clientKey(h, "10.0.0.1", 1)).toBe("203.0.113.7");
    expect(clientKey(h, "10.0.0.1", 2)).toBe("2.2.2.2");
  });
  it("falls back to the peer when the chain is too short or malformed", () => {
    expect(clientKey(new Headers(), "10.0.0.1", 1)).toBe("10.0.0.1");
    expect(clientKey(new Headers({ "x-forwarded-for": "not-an-ip" }), "10.0.0.1", 1)).toBe("10.0.0.1");
    expect(clientKey(new Headers({ "x-forwarded-for": "1.1.1.1" }), "10.0.0.1", 2)).toBe("10.0.0.1");
  });
  it("collapses IPv4-mapped IPv6 and groups IPv6 by /64", () => {
    expect(normaliseIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(normaliseIp("2001:db8:1:2:aaaa::1")).toBe(normaliseIp("2001:db8:1:2:bbbb::9"));
    expect(normaliseIp("2001:db8:1:3::1")).not.toBe(normaliseIp("2001:db8:1:2::1"));
  });
});

describe("registration rate limiting", () => {
  it("is not bypassed by changing x-forwarded-for on every request", async () => {
    const { app } = setup();
    const c = from(app, "198.51.100.9");
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await reg(new Client(c.app), `u${i}`, { "x-forwarded-for": `10.1.${i}.${i}` })).status);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429, 429, 429, 429]);
  });

  it("does not let a forged header on the SAME peer reset or dodge the count, even with many spoofed values", async () => {
    const { app } = setup();
    const peer = from(app, "198.51.100.10");
    let limited = 0;
    for (let i = 0; i < 30; i++) {
      const r = await reg(new Client(peer.app), `v${i}`, { "x-forwarded-for": i % 2 ? "" : `192.0.2.${i}` });
      if (r.status === 429) limited++;
    }
    expect(limited).toBe(10);
  });

  it("limits peers separately, so a different household is unaffected", async () => {
    const { app } = setup();
    const a = from(app, "198.51.100.11");
    for (let i = 0; i < 21; i++) await reg(new Client(a.app), `a${i}`);
    expect((await reg(new Client(a.app), "a-extra")).status).toBe(429);
    const b = from(app, "198.51.100.12");
    expect((await reg(new Client(b.app), "b0")).status).toBe(200);
  });

  it("allows a realistic shared-IP group (a classroom of 20) without limiting anyone", async () => {
    const { app } = setup();
    const room = from(app, "198.51.100.13");
    for (let i = 0; i < 20; i++) expect((await reg(new Client(room.app), `kid${i}`)).status).toBe(200);
  });

  it("recovers once the window passes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { app } = setup();
    const peer = from(app, "198.51.100.14");
    for (let i = 0; i < 20; i++) await reg(new Client(peer.app), `r${i}`);
    expect((await reg(new Client(peer.app), "r-blocked")).status).toBe(429);
    vi.setSystemTime(new Date("2026-01-01T00:16:00Z"));
    expect((await reg(new Client(peer.app), "r-after")).status).toBe(200);
  });

  it("honours x-forwarded-for only through the configured trusted proxy hop", async () => {
    const app = createApp({ db: openDb(":memory:"), course: sharedCourse(), trustedProxyHops: 1 });
    const viaProxy = (n: number, real: string, forged: string) =>
      reg(new Client({ ...app, fetch: (r: Request) => app.fetch(r, { remoteAddress: "10.0.0.2" }) } as typeof app), `p${n}`, { "x-forwarded-for": `${forged}, ${real}` });
    for (let i = 0; i < 20; i++) expect((await viaProxy(i, "203.0.113.50", `7.7.7.${i}`)).status).toBe(200);
    expect((await viaProxy(99, "203.0.113.50", "8.8.8.8")).status).toBe(429); // forged prefix did not help
    expect((await viaProxy(100, "203.0.113.51", "8.8.8.8")).status).toBe(200); // a different real client is fine
  });

  it("keeps protecting sign-in per account and per address", async () => {
    const { app } = setup();
    const peer = from(app, "198.51.100.15");
    await reg(new Client(peer.app), "victim");
    const attempts: number[] = [];
    for (let i = 0; i < 12; i++) attempts.push((await new Client(peer.app).call("POST", "/api/auth/login", { email: email("victim"), password: "wrong password" }, { "x-forwarded-for": `1.2.3.${i}` })).status);
    expect(attempts.slice(0, 9).every((s) => s === 401)).toBe(true);
    expect(attempts.slice(10)).toEqual([429, 429]);
  });
});

describe("retrying a registration whose response was lost", () => {
  it("returns the already-upgraded account to the guest's own session instead of failing with email_taken", async () => {
    const { client } = setup();
    const c = client();
    const guest = await c.post("/api/auth/guest");
    expect((await reg(c, "ada")).status).toBe(200); // response "lost" client-side; the server finished the upgrade
    const again = await reg(c, "ada");
    expect(again.status).toBe(200);
    expect(again.body.user).toMatchObject({ id: guest.body.user.id, isGuest: false, email: email("ada") });
  });
  it("still refuses a wrong password, another account's session and anonymous callers", async () => {
    const { client } = setup();
    const c = client();
    await c.post("/api/auth/guest");
    await reg(c, "ada");
    expect((await c.post("/api/auth/register", { email: email("ada"), password: "not the password", displayName: "ada" })).status).toBe(409);
    expect((await reg(client(), "ada")).status).toBe(409);
    const g = client();
    await g.post("/api/auth/guest");
    expect((await reg(g, "ada")).status).toBe(409);
  });
});
