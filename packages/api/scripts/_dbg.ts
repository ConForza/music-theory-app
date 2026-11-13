import { buildIndex, loadCurriculum } from "@mtp/curriculum";
import { generateItem } from "@mtp/engine";
const { curriculum } = loadCurriculum();
const ix = buildIndex(curriculum!);
for (let s = 0; s < 60; s++) { try { generateItem(ix, "t.g4.grouping-judge", s); } catch (e) { console.log(s, (e as Error).stack?.split("\n").slice(0, 5).join("\n")); break; } }
