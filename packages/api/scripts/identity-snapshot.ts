/**
 * Prints (or writes with --out) a digest of every question identity the app can produce, so a change of WORDING can be proved to change no
 * identity. For every node binding (lesson, practice, review, challenge, assessment) it generates seeds 1..SEEDS under the binding's own
 * scope; for every lesson file and Practice Lab set it reads the fixed items. Per question it records `questionKey`, `visibleKey` and the concepts whose review
 * boundary the question satisfies (those boundaries can read the prompt), and stores one short digest per binding or lesson file.
 *
 * The fixture packages/api/test/fixtures/identity-before-wording-audit.json was produced by this script on main at 94754cb (PR #29 merged),
 * before the question-wording audit; `question-wording.test.ts` requires every entry to be identical today. Reworded questions carry their
 * earlier wording in `legacyPrompt`, which identity reads in place of the prompt (see question-key.ts).
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildIndex, effectiveScope, loadCurriculum, type ExerciseItem } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { loadConstraints, questionKey, satisfies, visibleKey } from "../src/question-key.ts";

export const SEEDS = 4;
const root = join(import.meta.dirname, "../../../content");

export function identitySnapshot(): Record<string, string> {
  const { curriculum } = loadCurriculum();
  const ix = buildIndex(curriculum!);
  const constraints = loadConstraints(root, ix.concepts as Map<string, unknown>);
  const facts = (item: ExerciseItem) => [questionKey(item), visibleKey(item), [...constraints.entries()].filter(([, c]) => satisfies(item, c)).map(([id]) => id)];
  const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
  const out: Record<string, string> = {};
  for (const node of ix.nodes) {
    for (const b of node.exercises) {
      if (!ix.templates.has(b.templateId)) continue;
      const scope = effectiveScope(ix, node, b);
      const rows: unknown[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        try {
          rows.push(facts(generateItem(ix, b.templateId, seed, { scope }).item));
        } catch (e) {
          rows.push(String((e as Error).message).slice(0, 40));
        }
      }
      out[`binding|${node.id}|${b.templateId}`] = digest(rows);
    }
  }
  for (const l of curriculum!.lessons) out[`lesson|${l.content.lessonId}`] = digest([...l.content.guided, ...l.content.independent].map((it) => [it.id, ...facts(it)]));
  // Practice Lab sets: fixed items whose identity is stored as practice exposure (added after the first review; the showcase files were then
  // still byte-identical to main at 94754cb, so these entries are that state too).
  for (const s of curriculum!.showcase) out[`showcase|${s.content.id}`] = digest(s.content.items.map((it) => [it.id, ...facts(it as ExerciseItem)]));
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const snap = identitySnapshot();
  const i = process.argv.indexOf("--out");
  if (i > 0) writeFileSync(process.argv[i + 1]!, JSON.stringify(snap, null, 1) + "\n");
  else console.log(JSON.stringify(snap, null, 1));
  console.error(`${Object.keys(snap).length} identity digests`);
}
