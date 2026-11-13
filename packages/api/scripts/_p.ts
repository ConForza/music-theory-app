import { buildIndex, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
const [, , tid, s0 = "1", cnt = "3"] = process.argv;
for (let s = Number(s0); s < Number(s0) + Number(cnt); s++) {
  const it = generateItem(ix, tid!, s).item;
  console.log(JSON.stringify({ prompt: it.prompt, music: it.music ? { clef: it.music.clef, key: it.music.key, ts: it.music.timeSignature, pres: it.music.presentation, alt: it.music.textAlternative, q: it.music.questionAlternative } : null, answer: it.answer }, null, 1).slice(0, 1800));
}
