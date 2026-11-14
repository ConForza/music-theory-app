// Sample Grade 5 templates under their own (full grade) scope: success rate, distinct questions and example prompts.
import { buildIndex, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { questionKey } from "../src/question-key.ts";
const [, , pattern = "t.g5.", n = "150", show = "3"] = process.argv;
const { curriculum, issues } = loadCurriculum();
if (!curriculum) { console.log(issues?.slice(0, 5)); process.exit(1); }
const ix = buildIndex(curriculum);
for (const t of ix.templates.values()) {
  if (!t.id.startsWith(pattern) && !t.id.includes(pattern)) continue;
  let ok = 0; const keys = new Set<string>(); const errs: Record<string, number> = {}; const ex: string[] = [];
  for (let s = 0; s < Number(n); s++) {
    try { const it = generateItem(ix, t.id, s).item; ok++; keys.add(questionKey(it)); if (ex.length < Number(show)) ex.push(it.prompt.slice(0, 140)); } catch (e) { const m = (e as Error).message.slice(0, 160); errs[m] = (errs[m] ?? 0) + 1; }
  }
  console.log(`${t.id}: ok ${ok}/${n} distinct ${keys.size}`, Object.keys(errs).length ? errs : "");
  for (const e of ex) console.log("   ", e);
}
