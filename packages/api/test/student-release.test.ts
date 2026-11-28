/**
 * Student release: class-code sign-in (MTP_AUDIENCE=students), the public privacy notice, and the start-up checks that keep children out
 * until the owner's prerequisites (gate, approved notice, backups) are in place.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { studentReleaseProblem } from "../src/config.ts";
import { openDb, type Db } from "../src/db.ts";
import { PREVIEW_COOKIE, createPreviewGate, newClassCode, newInvite, normaliseClassCode, type Audience } from "../src/preview-gate.ts";
import { privacyPage, privacySettingsFromEnv, type PrivacySettings } from "../src/privacy.ts";
import { createHttpServer } from "../src/server.ts";
import { sharedCourse } from "./helpers.ts";

const dir = mkdtempSync(join(tmpdir(), "mtp-students-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const web = join(dir, "web");
mkdirSync(join(web, "assets"), { recursive: true });
writeFileSync(join(web, "index.html"), "<!doctype html><title>app</title><p>SECRET COURSE PAGE</p>");

const approved: PrivacySettings = privacySettingsFromEnv({
  MTP_PRIVACY_OPERATOR: "Smith & Co <Piano>",
  MTP_PRIVACY_CONTACT: "lessons@example.org",
  MTP_PRIVACY_NOTICE_APPROVED: "2026-12-01",
  MTP_BACKUP_DIR: "/data/backups",
});

interface Srv {
  db: Db;
  get: (path: string, init?: RequestInit) => Promise<Response>;
  post: (fields: Record<string, string>, cookie?: string) => Promise<Response>;
}
async function withServer<T>(access: string, audience: Audience, fn: (s: Srv) => Promise<T>, o: { db?: Db; privacy?: PrivacySettings } = {}): Promise<T> {
  const db = o.db ?? openDb(":memory:");
  const gate = createPreviewGate(access, { db, secureCookies: true, audience });
  const server = createHttpServer(createApp({ db, course: sharedCourse(), secureCookies: true }), web, { gate, https: true, privacy: o.privacy ?? approved });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  const get = (p: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${port}${p}`, { redirect: "manual", ...init });
  const post: Srv["post"] = (fields, cookie) =>
    get("/preview/signin", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: `https://127.0.0.1:${port}`, ...(cookie ? { cookie } : {}) },
      body: new URLSearchParams(fields).toString(),
    });
  try {
    return await fn({ db, get, post });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}
const cookieOf = (r: Response) => r.headers.getSetCookie().find((c) => c.startsWith(`${PREVIEW_COOKIE}=`))?.split(";")[0];

describe("class codes", () => {
  it("are 16 unambiguous characters in groups of four, and the entry stores only the hash of the normalised code", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = newClassCode("piano-2027");
      expect(c.code).toMatch(/^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$/);
      expect(c.entry).toMatch(/^piano-2027:[0-9a-f]{64}$/);
      expect(c.entry).not.toContain(normaliseClassCode(c.code));
      seen.add(c.code);
    }
    expect(seen.size).toBe(200);
    expect(normaliseClassCode(" k7qm-3pxa r9td-h2wn ")).toBe("K7QM3PXAR9TDH2WN");
    expect(() => newClassCode("no spaces allowed")).toThrow(/Class name/);
  });
});

describe("students sign in with only a class code", () => {
  const piano = newClassCode("piano");
  const theory = newClassCode("theory");
  const tester = newInvite("alice");
  const access = [piano.entry, theory.entry, tester.entry].join(",");

  it("shows a one-field class-code form written for students, with the privacy notice linked", async () => {
    await withServer(access, "students", async ({ get }) => {
      const html = await (await get("/preview/signin")).text();
      expect(html).toContain("Class code");
      expect(html).not.toContain("Tester name");
      expect(html).not.toContain("adult testers");
      expect(html).toContain('href="/privacy"');
      expect(html).not.toMatch(/<script/i);
    });
  });

  it("accepts the code however it is typed (case, spaces, hyphens), ties the session to that class, and opens the app", async () => {
    await withServer(access, "students", async ({ get, post, db }) => {
      const typed = ` ${piano.code.toLowerCase().replace(/-/g, " ")} `;
      const r = await post({ password: typed, next: "/learn" });
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toBe("/learn");
      const cookie = cookieOf(r)!;
      expect(cookie).toBeTruthy();
      expect((db.prepare("SELECT tester FROM preview_sessions").get() as { tester: string }).tester).toBe("piano");
      const page = await get("/", { headers: { cookie } });
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("SECRET COURSE PAGE");
      const status = await (await get("/preview/session", { headers: { cookie } })).json();
      expect(status).toMatchObject({ preview: true, signedIn: true, audience: "students" });
    });
  });

  it("refuses a wrong or empty code with a message for children, and an adult tester's password still works as a code", async () => {
    await withServer(access, "students", async ({ post }) => {
      for (const bad of ["", "ABCD-EFGH-JKMN-PQRS", piano.code.slice(0, -1)]) {
        const r = await post({ password: bad });
        expect(r.status, bad).toBe(401);
        expect(cookieOf(r)).toBeUndefined();
        expect(await r.text()).toContain("class code didn&#39;t work");
      }
      expect((await post({ password: tester.password })).status).toBe(303);
      // A name, when sent, must match its own entry.
      expect((await post({ username: "theory", password: piano.code })).status).toBe(401);
      expect((await post({ username: "piano", password: piano.code })).status).toBe(303);
    });
  });

  it("revoking a class (removing its entry and redeploying) ends its devices' sessions and leaves other classes signed in", async () => {
    const db = openDb(":memory:");
    const cookies = await withServer(access, "students", async ({ post }) => [cookieOf(await post({ password: piano.code }))!, cookieOf(await post({ password: theory.code }))!], { db });
    await withServer([theory.entry, tester.entry].join(","), "students", async ({ get, post }) => {
      expect((await get("/api/course", { headers: { cookie: cookies[0]! } })).status).toBe(401);
      expect((await get("/api/course", { headers: { cookie: cookies[1]! } })).status).toBe(200);
      expect((await post({ password: piano.code })).status).toBe(401);
    }, { db });
  });

  it("the testers' preview is unchanged: a code alone (no tester name) is not accepted there", async () => {
    await withServer(access, "testers", async ({ get, post }) => {
      expect(await (await get("/preview/signin")).text()).toContain("Tester name");
      expect((await post({ password: piano.code })).status).toBe(401);
      expect((await post({ username: "alice", password: tester.password })).status).toBe(303);
    });
  });
});

describe("privacy notice", () => {
  it("is readable without signing in, even behind the gate, and leaks nothing of the app", async () => {
    await withServer(newClassCode("c").entry, "students", async ({ get }) => {
      const r = await get("/privacy");
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toMatch(/text\/html/);
      expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
      const html = await r.text();
      expect(html).not.toContain("SECRET");
      expect(html).not.toMatch(/<script/i);
      expect((await get("/privacy.css")).headers.get("content-type")).toMatch(/text\/css/);
      expect((await get("/privacy", { method: "POST" })).status).not.toBe(200);
    });
  });

  it("names the operator and contact (escaped), states the backup period, and shows no draft banner once approved", () => {
    const html = privacyPage(approved);
    expect(html).toContain("Smith &#38; Co &#60;Piano&#62;");
    expect(html).not.toContain("<Piano>");
    expect(html).toContain('href="mailto:lessons@example.org"');
    expect(html).toContain("deleted after 14 days");
    expect(html).toContain("1 December 2026");
    expect(html).not.toContain("Draft.");
    expect(html).toContain("For students");
    expect(html).toContain("For parents and carers");
    expect(html).toContain("ico.org.uk");
  });

  it("shows a draft banner and placeholders until the owner fills it in, and states a guest period only once deletion is approved", () => {
    const draft = privacyPage(privacySettingsFromEnv({ MTP_PRIVACY_NOTICE_APPROVED: "soon" }));
    expect(draft).toContain("Draft.");
    expect(draft).toContain("[contact email]");
    expect(draft).toContain("stays until you ask us to delete it");
    expect(privacyPage(privacySettingsFromEnv({ MTP_GUEST_RETENTION_DAYS: "90" }))).not.toContain("after 90 days");
    expect(privacyPage(privacySettingsFromEnv({ MTP_GUEST_RETENTION_DAYS: "90", MTP_GUEST_RETENTION_APPROVED: "owner-approved" }))).toContain("deleted after 90 days without use");
  });
});

describe("the student release refuses to start until its prerequisites are in place", () => {
  const ready = {
    MTP_AUDIENCE: "students",
    MTP_PREVIEW_GATE: "1",
    MTP_PRIVACY_OPERATOR: "Example Piano Studio",
    MTP_PRIVACY_CONTACT: "lessons@example.org",
    MTP_PRIVACY_NOTICE_APPROVED: "2026-12-01",
    MTP_BACKUP_DIR: "/data/backups",
  };
  const railway = { ...ready, RAILWAY_ENVIRONMENT_ID: "env", RAILWAY_VOLUME_MOUNT_PATH: "/data", MTP_DB: "/data/mtp.sqlite", MTP_SECURE_COOKIES: "1" };

  it("is fine for the testers' preview (the default) and for a complete student configuration", () => {
    expect(studentReleaseProblem({})).toBeNull();
    expect(studentReleaseProblem({ MTP_AUDIENCE: "testers" })).toBeNull();
    expect(studentReleaseProblem(ready)).toBeNull();
    expect(studentReleaseProblem(railway)).toBeNull();
  });

  it("names every missing setting", () => {
    expect(studentReleaseProblem({ MTP_AUDIENCE: "kids" })).toMatch(/must be "testers" or "students"/);
    const all = studentReleaseProblem({ MTP_AUDIENCE: "students" })!;
    for (const v of ["MTP_PREVIEW_GATE", "MTP_PRIVACY_OPERATOR", "MTP_PRIVACY_CONTACT", "MTP_PRIVACY_NOTICE_APPROVED", "MTP_BACKUP_DIR"]) expect(all).toContain(v);
    expect(studentReleaseProblem({ ...ready, MTP_PRIVACY_CONTACT: "not an email" })).toMatch(/MTP_PRIVACY_CONTACT/);
    expect(studentReleaseProblem({ ...ready, MTP_PRIVACY_NOTICE_APPROVED: "yes" })).toMatch(/"yes" is not a date/);
    expect(studentReleaseProblem({ ...ready, MTP_BACKUP_KEEP: "0" })).toMatch(/MTP_BACKUP_KEEP/);
  });

  it("on Railway, needs the backups on the volume and HTTPS cookies", () => {
    expect(studentReleaseProblem({ ...railway, MTP_BACKUP_DIR: "/tmp/backups" })).toMatch(/inside the volume/);
    expect(studentReleaseProblem({ ...railway, MTP_SECURE_COOKIES: undefined })).toMatch(/MTP_SECURE_COOKIES=1/);
  });
});
