/**
 * Prints (or writes with --out) a JSON map "nodeId|templateId" -> generation fingerprint for every lesson, practice and review binding,
 * plus "template|templateId" for each template on its own grade scope. It is how the "no existing question identity changed" test is
 * pinned: the fixture packages/api/test/fixtures/fingerprints-before-terms.json was produced by this script on the tree before the
 * terminology completion work (PR #13 head), and the test requires every entry in it to be byte-for-byte identical today.
 */
import { writeFileSync } from "node:fs";
import { buildIndex, effectiveScope, loadCurriculum } from "@mtp/curriculum";
import { generationFingerprint, templateScope } from "@mtp/engine";

const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const out: Record<string, string> = {};
for (const node of ix.nodes) {
  for (const b of node.exercises) {
    const t = ix.templates.get(b.templateId);
    if (t) out[`${node.id}|${b.templateId}`] = generationFingerprint(t, effectiveScope(ix, node, b));
  }
}
for (const t of ix.templates.values()) out[`template|${t.id}`] = generationFingerprint(t, templateScope(ix, t));
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
const i = process.argv.indexOf("--out");
if (i > 0) writeFileSync(process.argv[i + 1]!, JSON.stringify(sorted, null, 1) + "\n");
else console.log(JSON.stringify(sorted, null, 1));
console.error(`${Object.keys(sorted).length} fingerprints`);
