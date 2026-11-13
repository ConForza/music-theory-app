import { buildIndex, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { questionKey } from "../src/question-key.ts";
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const only = process.argv[2];
const N = Number(process.argv[3] ?? 60);
for (const t of ix.templates.values()) {
  if (t.grade !== 4 || (only && !t.id.includes(only))) continue;
  let ok = 0; const errs: Record<string, number> = {}; const prompts = new Set<string>(); const keys = new Set<string>();
  for (let s = 0; s < N; s++) {
    try { const it = generateItem(ix, t.id, s).item; ok++; keys.add(questionKey(it)); if (prompts.size < 2) prompts.add(it.prompt.slice(0, 120)); } catch (e) { const m = (e as Error).message.replace(/^Could not generate a valid \S+ item for seed \d+: /, "").slice(0, 140); errs[m] = (errs[m] ?? 0) + 1; }
  }
  console.log(t.id.padEnd(34), `${ok}/${N}`, `distinct=${keys.size}`, Object.keys(errs).length ? JSON.stringify(Object.entries(errs).slice(0, 2)) : "");
  if (only) for (const p of prompts) console.log("     ", p);
}
