/**
 * Reset a learner's password (student release). The app sends no "forgot password" email, so a child who forgets asks the teacher.
 * First confirm the request through a contact you already know (the parent's usual email or phone, not a new address), then, in the
 * Railway dashboard's Console, in the app directory:
 *
 *   npm run account:reset-password -- parent@example.org
 *
 * It sets a new random TEMPORARY password, prints it once, and signs that account out on every device. Give it to the parent privately;
 * the learner signs in with it and changes it at once in Settings → Change password (sessions started with the temporary password end
 * when it is changed). No password is ever accepted on the command line (it would show in npm's banner, the shell history and the
 * process list). Progress is untouched; it never creates an account, never touches a guest and never runs migrations. It opens the live
 * database directly for one small transaction, which SQLite makes safe alongside the running app; a sign-in that was checking the old
 * password at that moment is refused (app.ts re-checks the stored hash before issuing a session).
 */
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword, setPassword } from "../src/auth.ts";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newTemporaryPassword(): string {
  let s = "";
  while (s.length < 16) for (const b of randomBytes(32)) if (b < 248 && s.length < 16) s += ALPHABET[b % 31];
  return s.match(/.{4}/g)!.join("-");
}

export async function resetPassword(dbFile: string, email: string): Promise<{ password: string; sessionsEnded: number }> {
  const address = email.trim().toLowerCase();
  const password = newTemporaryPassword();
  const hash = await hashPassword(password);
  const db = new DatabaseSync(dbFile);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    db.exec("BEGIN IMMEDIATE");
    try {
      const user = db.prepare("SELECT id FROM users WHERE email = ? AND is_guest = 0").get(address) as { id: string } | undefined;
      if (!user) throw new Error(`No account uses ${address}. Check the spelling (guests have no email and cannot be reset).`);
      const sessions = (db.prepare("SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?").get(user.id) as { c: number }).c;
      setPassword(db, user.id, hash);
      db.exec("COMMIT");
      return { password, sessionsEnded: sessions };
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    db.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [email, extra] = argv;
  if (!email || extra !== undefined) {
    console.error("Usage: npm run account:reset-password -- <email>\n(A password is never accepted here; a temporary one is generated and shown once.)");
    return 2;
  }
  const dbFile = resolve(process.env.MTP_DB ?? "data/mtp.sqlite");
  try {
    const r = await resetPassword(dbFile, email);
    console.log(`Password reset for ${email.trim().toLowerCase()}; signed out on ${r.sessionsEnded} device session(s).`);
    console.log(`Temporary password: ${r.password}`);
    console.log("Give it to the parent privately. The learner should sign in and change it straight away in Settings → Change password.");
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

if (process.argv[1]?.endsWith("reset-password.ts")) process.exit(await main(process.argv.slice(2)));
