import { backupSettingsFromEnv, type BackupSettings } from "./backups.ts";
import { privacyProblems, privacySettingsFromEnv } from "./privacy.ts";

/**
 * The test clock moves the server's notion of "now" and is only for automated tests. It needs BOTH the explicit flag and an
 * explicit test mode, so setting the flag alone (in development, staging or any unknown environment) never exposes it.
 */
export function testClockEnabled(env: Record<string, string | undefined>): boolean {
  return env.MTP_TEST_CLOCK === "1" && env.NODE_ENV === "test";
}

/**
 * Railway runs this from an ephemeral container; only the volume survives a deploy. On Railway the database must therefore be set
 * explicitly and live inside the mounted volume (never the default packages/api/data), and the private-preview gate must be on so a public
 * route can never serve the app ungated. Returns the problem, or null when fine/not on Railway.
 */
export function railwayProblem(env: Record<string, string | undefined>): string | null {
  if (!env.RAILWAY_ENVIRONMENT_ID) return null;
  if (env.MTP_PREVIEW_GATE !== "1") return "MTP_PREVIEW_GATE=1 is required on Railway: the preview must never be served without its access gate.";
  const mount = env.RAILWAY_VOLUME_MOUNT_PATH?.replace(/\/+$/, "");
  if (!mount) return "Running on Railway without a mounted volume (RAILWAY_VOLUME_MOUNT_PATH is unset). Attach a volume at /data before starting.";
  if (!env.MTP_DB) return `MTP_DB is not set. On Railway set MTP_DB=${mount}/mtp.sqlite so the database lives on the volume.`;
  if (!env.MTP_DB.startsWith(`${mount}/`)) return `MTP_DB (${env.MTP_DB}) is outside the volume mount ${mount}; it would be lost on the next deploy.`;
  return null;
}

/**
 * The student release (MTP_AUDIENCE=students) lets children in, so it refuses to start until the owner's prerequisites are in place: the
 * access gate (students come in with a class code), an approved privacy notice naming who runs the service and how to reach them, and
 * automatic backups (on Railway, on the volume, and HTTPS cookies). Returns every problem at once, or null when fine.
 */
export function studentReleaseProblem(env: Record<string, string | undefined>): string | null {
  const audience = env.MTP_AUDIENCE?.trim() || "testers";
  if (audience !== "testers" && audience !== "students") return `MTP_AUDIENCE must be "testers" or "students" (got "${env.MTP_AUDIENCE}").`;
  if (audience === "testers") return null;
  const missing: string[] = [];
  if (env.MTP_PREVIEW_GATE !== "1") missing.push("MTP_PREVIEW_GATE=1 (students sign in with a class code)");
  missing.push(...privacyProblems(privacySettingsFromEnv(env), env));
  let backups: BackupSettings | null = null;
  try {
    backups = backupSettingsFromEnv(env);
    if (!backups) missing.push("MTP_BACKUP_DIR (automatic backups, e.g. /data/backups)");
  } catch (e) {
    missing.push((e as Error).message);
  }
  if (env.RAILWAY_ENVIRONMENT_ID) {
    const mount = env.RAILWAY_VOLUME_MOUNT_PATH?.replace(/\/+$/, "");
    if (backups && mount && !backups.dir.startsWith(`${mount}/`)) missing.push(`MTP_BACKUP_DIR inside the volume (${mount}/backups); ${backups.dir} would be lost on the next deploy`);
    if (env.MTP_SECURE_COOKIES !== "1") missing.push("MTP_SECURE_COOKIES=1");
  }
  return missing.length ? `The student release (MTP_AUDIENCE=students) cannot start yet. Set: ${missing.join("; ")}.` : null;
}
