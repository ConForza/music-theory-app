import { buildIndex, effectiveScope, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const node = ix.nodeById.get("G1-U7-L03")!;
const b = node.exercises.find((x) => x.templateId === "t.g1.term-sign")!;
const scope = effectiveScope(ix, node, b);
const kinds: Record<string, number> = {};
for (let s = 0; s < 600; s++) { try { const it = generateItem(ix, "t.g1.term-sign", s, { scope }).item; const k = it.prompt.slice(0, 50); kinds[k] = (kinds[k] ?? 0) + 1; } catch (e) { const m = (e as Error).message.slice(0, 160); kinds[m] = (kinds[m] ?? 0) + 1; } }
console.log(kinds);
