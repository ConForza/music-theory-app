// Sample a template under a node binding's scope: success rate, distinct questions, and example prompts.
import { buildIndex, effectiveScope, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
import { questionKey } from "../src/question-key.ts";
const [, , nodeId, templateId, n = "200"] = process.argv;
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const node = ix.nodeById.get(nodeId!)!;
const b = node.exercises.find((x) => x.templateId === templateId)!;
const scope = effectiveScope(ix, node, b);
let ok = 0;
const keys = new Set<string>();
const errs: Record<string, number> = {};
const prompts = new Set<string>();
for (let s = 0; s < Number(n); s++) {
  try { const it = generateItem(ix, templateId!, s, { scope }).item; ok++; keys.add(questionKey(it)); if (prompts.size < 8) prompts.add(it.prompt); } catch (e) { const m = (e as Error).message.slice(0, 100); errs[m] = (errs[m] ?? 0) + 1; }
}
console.log({ ok, of: n, distinct: keys.size, errs });
console.log([...prompts].join("\n"));
