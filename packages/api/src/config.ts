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
