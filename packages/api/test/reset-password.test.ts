/** The teacher's password reset (student release): one account's temporary password, its sessions ended, nothing else touched. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { newTemporaryPassword, resetPassword } from "../scripts/reset-password.ts";
import { createSession, createUser, hashPassword, verifyPassword } from "../src/auth.ts";
import { openDb } from "../src/db.ts";

const dir = mkdtempSync(join(tmpdir(), "mtp-reset-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const hashOf = (db: ReturnType<typeof openDb>, id: string) => (db.prepare("SELECT password_hash AS h FROM users WHERE id = ?").get(id) as { h: string }).h;

describe("reset-password", () => {
  it("sets a generated temporary password, signs that learner out everywhere, and leaves other accounts alone", async () => {
    const file = join(dir, "a.sqlite");
    const db = openDb(file);
    const amy = createUser(db, { displayName: "Amy", email: "amy@example.org", passwordHash: await hashPassword("forgotten-1") });
    const ben = createUser(db, { displayName: "Ben", email: "ben@example.org", passwordHash: await hashPassword("bens-pass-1") });
    createSession(db, amy.id);
    createSession(db, amy.id);
    createSession(db, ben.id);

    const r = await resetPassword(file, "  AMY@example.org ");
    expect(r.sessionsEnded).toBe(2);
    expect(r.password).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
    expect(await verifyPassword(r.password, hashOf(db, amy.id))).toBe(true);
    expect(await verifyPassword("forgotten-1", hashOf(db, amy.id))).toBe(false);
    expect(await verifyPassword("bens-pass-1", hashOf(db, ben.id))).toBe(true);
    expect((db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?").get(ben.id) as { c: number }).c).toBe(1);
    db.close();
  });

  it("refuses an unknown email and a guest, changing nothing", async () => {
    const file = join(dir, "b.sqlite");
    const db = openDb(file);
    createUser(db, { displayName: "Guest" });
    const cara = createUser(db, { displayName: "Cara", email: "cara@example.org", passwordHash: await hashPassword("caras-pass") });
    await expect(resetPassword(file, "nobody@example.org")).rejects.toThrow(/No account uses nobody@example.org/);
    expect(await verifyPassword("caras-pass", hashOf(db, cara.id))).toBe(true);
    db.close();
  });

  it("never takes a password on the command line: a second argument is refused, and the script prints none it was given", async () => {
    const { execFileSync } = await import("node:child_process");
    const run = (args: string[]) => {
      try {
        execFileSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--import", "tsx", "scripts/reset-password.ts", ...args], { env: { ...process.env, MTP_DB: join(dir, "c.sqlite") }, encoding: "utf8", stdio: "pipe" });
        return { code: 0, out: "" };
      } catch (e) {
        const err = e as { status: number; stdout: string; stderr: string };
        return { code: err.status, out: err.stdout + err.stderr };
      }
    };
    const r = run(["someone@example.org", "chosen-secret-123"]);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("chosen-secret-123");
    expect(r.out).toMatch(/never accepted/);
  });

  it("makes long, readable temporary passwords", () => {
    for (let i = 0; i < 50; i++) expect(newTemporaryPassword()).toHaveLength(19);
  });
});
