/**
 * Make an access credential. Nothing is stored: append the printed entry to the MTP_PREVIEW_ACCESS Railway variable and deploy.
 *
 *   npm run preview:invite -w @mtp/api -- alice              an adult tester: a random password (give it once, by a private channel)
 *   npm run preview:invite -w @mtp/api -- --class piano-2027  a class (or family) code for the student release: `K7QM-3PXA-R9TD-H2WN`
 *
 * Removing the entry and redeploying revokes it, and ends every device session that used it.
 */
import { newClassCode, newInvite } from "../src/preview-gate.ts";

const args = process.argv.slice(2);
const asClass = args[0] === "--class";
const name = asClass ? args[1] : args[0];
if (!name) {
  console.error("Usage: npm run preview:invite -w @mtp/api -- <tester-name>\n       npm run preview:invite -w @mtp/api -- --class <class-name>");
  process.exit(2);
}
if (asClass) {
  const c = newClassCode(name);
  console.log(`Class:      ${c.name}\nClass code: ${c.code}   (give it to these students and their parents; not recoverable)\n\nAppend to the MTP_PREVIEW_ACCESS Railway variable (comma-separated):\n${c.entry}`);
} else {
  const i = newInvite(name);
  console.log(`Tester:   ${i.name}\nPassword: ${i.password}   (show once; not recoverable)\n\nAppend to the MTP_PREVIEW_ACCESS Railway variable (comma-separated):\n${i.entry}`);
}
