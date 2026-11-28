import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { backupBeforeMigrations, backupSettingsFromEnv, dailyBackupIfDue, restoreAtStartup } from "./backups.ts";
import { isInside, railwayProblem, studentReleaseProblem, testClockEnabled } from "./config.ts";
import { erasureLogFromEnv } from "./erasures.ts";
import { privacySettingsFromEnv } from "./privacy.ts";
import { accessProblems, createPreviewGate } from "./preview-gate.ts";
import { loadCourse } from "./course.ts";
import { openDb, tx } from "./db.ts";
import { retentionPolicyFromEnv } from "./retention.ts";
import { startServer } from "./startup.ts";

const problem = railwayProblem(process.env) ?? studentReleaseProblem(process.env);
if (problem) {
  console.error(problem);
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const dbPath = resolve(process.env.MTP_DB ?? resolve(here, "../data/mtp.sqlite"));
mkdirSync(dirname(dbPath), { recursive: true });
const staticDir = process.env.MTP_STATIC_DIR ?? resolve(here, "../../web/dist");

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

// Automatic backups (MTP_BACKUP_DIR): the directory must be writable, and a verified snapshot is taken BEFORE any migration touches the
// database; start-up fails otherwise. On Railway the backups must really land on the volume (after resolving `..` and links).
// MTP_RESTORE_FROM restores a backup first, while nothing else can be writing (backups.ts#restoreAtStartup).
const { backups, erasures } = (() => {
  try {
    const settings = backupSettingsFromEnv(process.env);
    const mount = process.env.RAILWAY_ENVIRONMENT_ID ? process.env.RAILWAY_VOLUME_MOUNT_PATH : undefined;
    if (settings && mount && !isInside(settings.dir, mount)) throw new Error(`MTP_BACKUP_DIR (${settings.dir}) is not on the volume ${mount}.`);
    if (mount && !isInside(dbPath, mount)) throw new Error(`MTP_DB (${dbPath}) is not on the volume ${mount}.`);
    const log = erasureLogFromEnv(process.env, dbPath, !!settings);
    const restored = restoreAtStartup(dbPath, settings, process.env.MTP_RESTORE_FROM, log);
    if (restored) console.log(restored);
    const line = backupBeforeMigrations(dbPath, settings);
    if (line) console.log(line);
    return { backups: settings, erasures: log };
  } catch (e) {
    return fail(`${(e as Error).message} The database was not opened or migrated.`);
  }
})();
console.log(backups ? `Automatic backups ON: ${backups.dir} (each kept ${backups.keep} days).` : "Automatic backups OFF (MTP_BACKUP_DIR is unset).");

const db = openDb(dbPath);
// A database restored from a backup must not bring back an account deleted after that backup was taken (erasures.ts).
if (erasures) {
  const log = erasures;
  const removed = tx(db, () => log.apply(db));
  const pruned = log.prune();
  console.log(`Erasure log ${log.file}: ${removed} restored account(s) erased again; ${pruned} entr${pruned === 1 ? "y" : "ies"} older than ${log.keepDays} days dropped.`);
}
// Readiness: with backups configured, a working daily snapshot exists BEFORE the server accepts any request.
if (backups) {
  try {
    const line = dailyBackupIfDue(dbPath, backups);
    if (line) console.log(line);
  } catch (e) {
    db.close();
    fail(`${(e as Error).message} The server did not start listening.`);
  }
}
const app = createApp({
  db,
  // Browser suites for earlier briefs pin the content of their era (MTP_CONTENT_ROOT); production always serves the shipped content.
  course: loadCourse(process.env.NODE_ENV !== "production" ? process.env.MTP_CONTENT_ROOT || undefined : undefined),
  secureCookies: process.env.MTP_SECURE_COOKIES === "1",
  waiveUnwrittenPrerequisites: process.env.MTP_WAIVE_UNWRITTEN !== "0",
  trustedProxyHops: Number(process.env.MTP_TRUST_PROXY_HOPS ?? 0) || 0,
  // Browser journeys only: needs explicit MTP_TEST_CLOCK=1 and NODE_ENV=test.
  testClock: testClockEnabled(process.env),
  allowedOrigins: (process.env.MTP_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
  // Optional override of the per-address guest-creation limit (default 60 per 15 minutes); a positive whole number only.
  ...(/^[1-9]\d{0,5}$/.test(process.env.MTP_GUEST_CREATIONS_PER_15_MIN ?? "") ? { guestCreationsPer15Min: Number(process.env.MTP_GUEST_CREATIONS_PER_15_MIN) } : {}),
  // Optional override of the per-address registration limit (default 20 per 15 minutes), e.g. for a class registering from one school network.
  ...(/^[1-9]\d{0,5}$/.test(process.env.MTP_REGISTRATIONS_PER_15_MIN ?? "") ? { registrationsPer15Min: Number(process.env.MTP_REGISTRATIONS_PER_15_MIN) } : {}),
  ...(erasures ? { erasures } : {}),
});
const secure = process.env.MTP_SECURE_COOKIES === "1";
// Private preview: MTP_PREVIEW_GATE=1 puts every route except /api/health, the tester sign-in page and installation metadata behind an
// invited tester's preview session (see preview-gate.ts).
const gate =
  process.env.MTP_PREVIEW_GATE === "1"
    ? createPreviewGate(process.env.MTP_PREVIEW_ACCESS, {
        db,
        secureCookies: secure,
        allowedOrigins: (process.env.MTP_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean),
        trustedProxyHops: Number(process.env.MTP_TRUST_PROXY_HOPS ?? 0) || 0,
        audience: process.env.MTP_AUDIENCE?.trim() === "students" ? "students" : "testers",
      })
    : undefined;
if (gate && gate.audience === "testers") for (const p of accessProblems(process.env.MTP_PREVIEW_ACCESS)) console.warn(`MTP_PREVIEW_ACCESS warning: ${p}`);
if (gate) {
  const who = gate.audience === "students" ? "class code(s) for students" : "invited tester(s)";
  console.log(`Preview access gate ON: ${gate.testers} ${who}.${gate.testers === 0 ? " Nobody can sign in." : ""}`);
}
const privacy = privacySettingsFromEnv(process.env);
startServer({
  app,
  staticDir,
  port,
  http: { https: secure, trustedProxyHops: Number(process.env.MTP_TRUST_PROXY_HOPS ?? 0) || 0, securityHeaders: process.env.MTP_SECURITY_HEADERS === "proxy" ? "proxy" : "app", privacy, ...(gate ? { gate } : {}) },
  // Set MTP_WARM_POOLS=0 only for local development: the pools are then sampled inside learners' requests (a 15-25 s stall each restart).
  warmPools: process.env.MTP_WARM_POOLS !== "0",
  retention: retentionPolicyFromEnv(),
}).then(
  (running) => {
    console.log(`Music Theory Path listening on http://localhost:${running.port} (db: ${dbPath})`);
    if (backups) {
      const daily = () => {
        try {
          const line = dailyBackupIfDue(dbPath, backups);
          if (line) console.log(line);
        } catch (e) {
          console.error(`BACKUP FAILED: ${(e as Error).message} Retrying in an hour.`);
        }
        try {
          erasures?.prune();
        } catch (e) {
          console.error(`Erasure log prune failed: ${(e as Error).message}`);
        }
      };
      setInterval(daily, 60 * 60_000).unref();
    }
    let exiting = false;
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.on(signal, () => {
        if (exiting) return;
        exiting = true;
        console.log(`${signal} received: finishing requests in flight, then stopping.`);
        void running.stop().then(() => process.exit(0));
      });
    }
  },
  (e: unknown) => {
    // A failed start must be visible to the process supervisor: say why and exit non-zero without ever opening the port.
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
