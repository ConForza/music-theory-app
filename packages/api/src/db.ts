import { DatabaseSync } from "node:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Db = DatabaseSync;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

const migrationFiles = (dir: string) => readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

/** Open (and migrate) a SQLite database. Use ":memory:" in tests. */
export function openDb(path = ":memory:"): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

/**
 * Apply numbered `migrations/NNN_name.sql` files exactly once. An applied migration is never re-run, so NEVER edit or append to
 * one that has shipped: add a new numbered file instead (an upgrade test in engagement-data.test.ts guards this).
 * Files run in order, each in a transaction.
 */
export function migrate(db: Db, dir = MIGRATIONS_DIR): string[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");
  const done = new Set((db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: string }>).map((r) => r.version));
  const applied: string[] = [];
  for (const file of migrationFiles(dir)) {
    if (done.has(file)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(dir, file), "utf8"));
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(file, new Date().toISOString());
      db.exec("COMMIT");
      applied.push(file);
    } catch (e) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`, { cause: e });
    }
  }
  return applied;
}

/**
 * Migrations a database file would receive on its next open, read without changing anything (no migration, no WAL mode switch). A file
 * that does not exist yet has nothing to protect, so it reports none.
 */
export function pendingMigrations(path: string, dir = MIGRATIONS_DIR): string[] {
  if (path === ":memory:" || !existsSync(path)) return [];
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    const done = new Set(table ? (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: string }>).map((r) => r.version) : []);
    return migrationFiles(dir).filter((f) => !done.has(f));
  } finally {
    db.close();
  }
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
