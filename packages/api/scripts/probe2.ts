import { buildIndex, effectiveScope, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const node = ix.nodeById.get("G1-U2-L06")!;
const b = node.exercises.find((x) => x.templateId === "t.g1.bar-judge")!;
const scope = effectiveScope(ix, node, b);
const kinds: Record<string, number> = {};
for (let s = 0; s < 1500; s++) { const it = generateItem(ix, "t.g1.bar-judge", s, { scope }).item; const k = it.prompt.replace(/\d\/4/, "N/4").slice(30, 90); kinds[k] = (kinds[k] ?? 0) + 1; }
console.log(kinds);
