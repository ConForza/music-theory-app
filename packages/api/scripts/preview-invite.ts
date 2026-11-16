/** Make a tester credential: `npm run preview:invite -w @mtp/api -- alice`. Prints the password (give it to the tester once, by a private channel) and the entry to append to MTP_PREVIEW_ACCESS. Nothing is stored. */
import { newInvite } from "../src/preview-gate.ts";

const name = process.argv[2];
if (!name) {
  console.error("Usage: npm run preview:invite -w @mtp/api -- <tester-name>");
  process.exit(2);
}
const i = newInvite(name);
console.log(`Tester:   ${i.name}\nPassword: ${i.password}   (show once; not recoverable)\n\nAppend to the MTP_PREVIEW_ACCESS Railway variable (comma-separated):\n${i.entry}`);
