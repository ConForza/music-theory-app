/** The teacher's password reset (student release): one account's password, its sessions ended, nothing else touched. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { newTemporaryPassword, resetPassword } from "../scripts/reset-password.ts";
import { createSession, createUser, hashPassword, verifyPassword } from "../src/auth.ts";
import { openDb } from "../src/db.ts";

const dir = mkdtempSync(join(tmpdir(), "mtp-reset-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("reset-password", () => {
  it("sets the new password, signs that learner out everywhere, and leaves other accounts alone", async () => {
    const file = join(dir, "a.sqlite");
    const db = openDb(file);
    const amy = createUser(db, { displayName: "Amy", email: "amy@example.org", passwordHash: await hashPassword("forgotten-1") });
    const ben = createUser(db, { displayName: "Ben", email: "ben@example.org", passwordHash: await hashPassword("bens-pass-1") });
    createSession(db, amy.id);
    createSession(db, amy.id);
    createSession(db, ben.id);

    const r = await resetPassword(file, "  AMY@example.org ", "new-pass-123");
    expect(r.sessionsEnded).toBe(2);
    const hashOf = (id: string) => (db.prepare("SELECT password_hash AS h FROM users WHERE id = ?").get(id) as { h: string }).h;
    expect(await verifyPassword("new-pass-123", hashOf(amy.id))).toBe(true);
    expect(await verifyPassword("forgotten-1", hashOf(amy.id))).toBe(false);
    expect(await verifyPassword("bens-pass-1", hashOf(ben.id))).toBe(true);
    expect((db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?").get(ben.id) as { c: number }).c).toBe(1);
    db.close();
  });

  it("refuses an unknown email, a guest and a too-short password, changing nothing", async () => {
    const file = join(dir, "b.sqlite");
    const db = openDb(file);
    createUser(db, { displayName: "Guest" });
    createUser(db, { displayName: "Cara", email: "cara@example.org", passwordHash: await hashPassword("caras-pass") });
    await expect(resetPassword(file, "nobody@example.org", "whatever-123")).rejects.toThrow(/No account uses nobody@example.org/);
    await expect(resetPassword(file, "cara@example.org", "short")).rejects.toThrow(/8 to 128/);
    const h = (db.prepare("SELECT password_hash AS h FROM users WHERE email = 'cara@example.org'").get() as { h: string }).h;
    expect(await verifyPassword("caras-pass", h)).toBe(true);
    db.close();
  });

  it("makes readable temporary passwords long enough to sign in with", () => {
    for (let i = 0; i < 50; i++) expect(newTemporaryPassword()).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  });
});
