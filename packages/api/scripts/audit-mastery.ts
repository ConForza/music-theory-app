import { createApp } from "../src/app.ts";
import { loadCourse } from "../src/course.ts";
import { openDb } from "../src/db.ts";
import { auditCapacity, CAPACITY_ALLOWLIST, shortfalls } from "../src/mastery-audit.ts";
/** Usage: tsx scripts/audit-mastery.ts [grade ...]   (default: every grade that has a playable course, currently 1 to 5). Exits 1 on a shortfall. */
const course = loadCourse();
const app = createApp({ db: openDb(":memory:"), course });
const grades = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [1, 2, 3, 4, 5];
let failed = 0;
for (const grade of grades) {
  console.log(`\n=== Grade ${grade} ===`);
  const rows = auditCapacity(course, app.nodes, grade);
  for (const r of rows) console.log(r.conceptId.padEnd(36), String(r.distinct).padStart(5), JSON.stringify(Object.fromEntries(Object.entries(r.templates).map(([t, n]) => [t.replace(/^t\.g\d\./, ""), n]))));
  const bad = shortfalls(rows, CAPACITY_ALLOWLIST);
  console.log(`\nSHORTFALLS (${bad.length}; allow-listed: ${Object.keys(CAPACITY_ALLOWLIST).filter((c) => rows.some((r) => r.conceptId === c)).join(", ") || "none"})`);
  for (const s of bad) console.log(" ", s.conceptId, "-", s.problem);
  failed += bad.length;
}
if (failed) process.exit(1);
