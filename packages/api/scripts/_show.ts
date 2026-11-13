import { buildIndex, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const [, , tid, s0 = "1", cnt = "3"] = process.argv;
for (let s = Number(s0); s < Number(s0) + Number(cnt); s++) {
  const it = generateItem(ix, tid!, s).item;
  const a: any = it.answer;
  const show = (a: any): any => a.kind === "choice" ? { opts: a.options.map((o: any) => `${o.id}=${o.label}`), right: a.correctOptionIds, diag: Object.keys(a.diagnoses ?? {}).length } : a.kind === "composite" ? a.parts.map((p: any) => ({ p: p.prompt, a: show(p.answer) })) : a.kind === "interval" ? { iv: a.acceptedIntervals ?? a.target, lower: a.lower, upper: a.upper, key: a.key, form: a.minorForm, ap: a.acceptedPitches } : a.kind === "pitch-sequence" ? { acc: a.accepted[0]?.join(" "), d: a.derivation } : a.kind === "rhythm" ? { task: a.task, ts: a.timeSignature, acc: JSON.stringify(a.accepted).slice(0, 160) } : a;
  console.log(`#${s} ${it.prompt}\n   ALT: ${(it.music?.questionAlternative ?? it.music?.textAlternative ?? (it.score?.textAlternative) ?? "").slice(0, 330)}\n   ANS: ${JSON.stringify(show(a)).slice(0, 520)}`);
}
