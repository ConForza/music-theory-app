/**
 * Reset a learner's password (student release). The app has no "forgot password" email, so a child who forgets theirs asks the teacher,
 * who runs this from the Railway dashboard's Console, in the app directory:
 *
 *   npm run account:reset-password -- learner@example.org            prints a new random password to pass on
 *   npm run account:reset-password -- learner@example.org 'chosen1'  sets one the family chose (8-128 characters)
 *
 * It changes only that account's password hash and signs that account out on every device. Progress is untouched. It never creates an
 * account, never touches a guest, and never runs migrations (it opens the live database directly, waiting briefly for the app's lock:
 * one small transaction, which SQLite makes safe alongside the running app). Prints no personal data beyond the email you typed.
 */
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../src/auth.ts";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newTemporaryPassword(): string {
  let s = "";
  while (s.length < 12) for (const b of randomBytes(24)) if (b < 248 && s.length < 12) s += ALPHABET[b % 31];
  return s.match(/.{4}/g)!.join("-");
}

export async function resetPassword(dbFile: string, email: string, password: string): Promise<{ sessionsEnded: number }> {
  const address = email.trim().toLowerCase();
  if (password.length < 8 || password.length > 128) throw new Error("The password must be 8 to 128 characters.");
  const hash = await hashPassword(password);
  const db = new DatabaseSync(dbFile);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    db.exec("BEGIN IMMEDIATE");
    try {
      const user = db.prepare("SELECT id FROM users WHERE email = ? AND is_guest = 0").get(address) as { id: string } | undefined;
      if (!user) throw new Error(`No account uses ${address}. Check the spelling (guests have no email and cannot be reset).`);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
      const ended = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id).changes;
      db.exec("COMMIT");
      return { sessionsEnded: Number(ended) };
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } finally {
    db.close();
  }
}

async function main(argv: string[]): Promise<number> {
  const [email, chosen] = argv;
  if (!email) {
    console.error("Usage: npm run account:reset-password -- <email> [new-password]");
    return 2;
  }
  const dbFile = resolve(process.env.MTP_DB ?? "data/mtp.sqlite");
  const password = chosen ?? newTemporaryPassword();
  try {
    const r = await resetPassword(dbFile, email, password);
    console.log(`Password reset for ${email.trim().toLowerCase()}; signed out on ${r.sessionsEnded} device session(s).`);
    if (!chosen) console.log(`New password: ${password}   (pass it to the learner or their parent privately; it is not shown again)`);
    return 0;
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
}

if (process.argv[1]?.endsWith("reset-password.ts")) process.exit(await main(process.argv.slice(2)));
