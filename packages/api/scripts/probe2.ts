import { buildIndex, effectiveScope, loadCurriculum } from "@mtp/curriculum";
import { canonicalResponse, generateItem, gradeItem } from "@mtp/engine";
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const node = ix.nodeById.get("G1-U2-P1")!;
const b = node.exercises.find((x) => x.templateId === "t.g1.bar-complete")!;
import { mergeScope } from "@mtp/curriculum";
let scope: any = null;
for (const n of ix.nodes) { if (n.type !== "lesson" || n.grade !== 1) continue; const bb = n.exercises.find((x) => x.templateId === "t.g1.bar-complete"); if (bb) { const e = effectiveScope(ix, n, bb); scope = scope ? mergeScope(scope, e) : e; } }
void node; void b;
let bad = 0;
for (let s = 0; s < 1500; s++) {
  const it = generateItem(ix, "t.g1.bar-complete", s, { scope }).item;
  const r = canonicalResponse(ix, it, scope) as any;
  const ans = it.answer as any;
  const given = ans.given?.length ?? 0;
  const got = r.measures[0].events.length;
  if (got <= given) { bad++; if (bad < 3) console.log(s, JSON.stringify(ans.given), JSON.stringify(ans.accepted[0][0].events.map((e: any) => e.duration.value + (e.kind === "rest" ? "R" : ""))), JSON.stringify(r.measures[0].events.map((e: any) => e.duration.value))); }
}
console.log("bad", bad);
