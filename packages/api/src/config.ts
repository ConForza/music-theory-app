/**
 * The test clock moves the server's notion of "now" and is only for automated tests. It needs BOTH the explicit flag and an
 * explicit test mode, so setting the flag alone (in development, staging or any unknown environment) never exposes it.
 */
export function testClockEnabled(env: Record<string, string | undefined>): boolean {
  return env.MTP_TEST_CLOCK === "1" && env.NODE_ENV === "test";
}
