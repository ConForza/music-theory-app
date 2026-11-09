import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { computeCoverage } from "./coverage.ts";
import { loadCurriculum, REPO_ROOT, type Curriculum, type Issue } from "./load.ts";
import {
  buildIndex,
  conceptsAvailableAt,
  outcomesTaughtBefore,
  scopeViolations,
  type CurriculumIndex,
} from "./model.ts";
import { classifyTimeSignature, formatKey, keysUpTo, parseKey, sameKey } from "./music/index.ts";
import { ID_PATTERNS } from "./schema.ts";
import { verifyLessonMusic } from "./verify-music.ts";

export interface ValidationOptions {
  /** Release gate: additionally requires teacher sign-off, approved templates and a confirmed syllabus. */
  release?: boolean;
  /** Repository root to scan for prohibited files (defaults to this repo). */
  repoRoot?: string;
}

export interface ValidationReport {
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
  stats: Record<string, number>;
}

const BOOK_SECTION_COUNTS: Record<number, number> = { 1: 19, 2: 14, 3: 12, 4: 15, 5: 15 };

export function validateCurriculum(c: Curriculum, options: ValidationOptions = {}): ValidationReport {
  const issues: Issue[] = [];
  const err = (code: string, where: string, message: string) => issues.push({ code, severity: "error", message, where });
  const warn = (code: string, where: string, message: string) =>
    issues.push({ code, severity: "warning", message, where });
  const ix = buildIndex(c);

  checkIds(c, err);
  checkReferences(ix, err);
  checkScopeTables(ix, err, warn);
  checkConcepts(ix, err, warn);
  checkPath(ix, err, warn);
  checkTemplates(ix, err, warn);
  checkAssessments(ix, err);
  checkCoverage(ix, err);
  checkBook(ix, err, warn);
  for (const i of verifyLessonMusic(ix)) issues.push(i);
  checkProvenance(ix, options.repoRoot ?? REPO_ROOT, err);
  checkReleaseClaims(ix, Boolean(options.release), err, warn);

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  return {
    issues,
    errors,
    warnings,
    stats: {
      outcomes: ix.outcomes.size,
      bookSections: c.book.sections.length,
      concepts: ix.concepts.size,
      units: ix.units.size,
      nodes: ix.nodes.length,
      lessons: ix.nodes.filter((n) => n.type === "lesson").length,
      templates: ix.templates.size,
      assessments: ix.assessments.size,
      exampleLessons: c.lessons.length,
    },
  };
}

export function validateContentRoot(root?: string, options: ValidationOptions = {}): ValidationReport {
  const { curriculum, issues } = loadCurriculum(root);
  if (!curriculum) {
    const errors = issues.filter((i) => i.severity === "error");
    return { issues, errors, warnings: issues.filter((i) => i.severity === "warning"), stats: {} };
  }
  const report = validateCurriculum(curriculum, options);
  const all = [...issues, ...report.issues];
  return { ...report, issues: all, errors: all.filter((i) => i.severity === "error"), warnings: all.filter((i) => i.severity === "warning") };
}

type Reporter = (code: string, where: string, message: string) => void;

// ---------------------------------------------------------------------------

function checkIds(c: Curriculum, err: Reporter) {
  const seen = new Map<string, string>();
  const record = (id: string, kind: string) => {
    const prev = seen.get(id);
    if (prev) err("DUPLICATE_ID", id, `ID is used by both a ${prev} and a ${kind}`);
    else seen.set(id, kind);
  };
  c.syllabus.outcomes.forEach((o) => record(o.id, "outcome"));
  c.book.sections.forEach((s) => record(s.id, "book section"));
  c.concepts.flatMap((f) => f.concepts).forEach((x) => record(x.id, "concept"));
  c.worlds.flatMap((w) => w.units).forEach((u) => record(u.id, "unit"));
  c.worlds.flatMap((w) => w.nodes).forEach((n) => record(n.id, "path node"));
  c.families.families.forEach((f) => record(f.id, "exercise family"));
  c.templates.flatMap((f) => f.templates).forEach((t) => record(t.id, "exercise template"));
  c.assessments.flatMap((f) => f.assessments).forEach((a) => record(a.id, "assessment"));
  c.engine.graders.forEach((g) => record(g.id, "grader"));
  c.engine.rulesets.forEach((r) => record(r.id, "ruleset"));
  const itemIds = [
    ...c.lessons.flatMap((l) => [...l.content.guided, ...l.content.independent]),
    ...c.items.map((i) => i.content.item),
  ].map((i) => i.id);
  itemIds.forEach((i) => record(i, "exercise item"));
  c.lessons.forEach((l) => record(l.content.id, "lesson content"));

  // Grade prefixes embedded in IDs must agree with the declared grade.
  for (const o of c.syllabus.outcomes) if (!o.id.includes(`.g${o.grade}.`)) err("ID_GRADE_MISMATCH", o.id, `Outcome declares grade ${o.grade}`);
  for (const f of c.templates) {
    if (f.templates.some((t) => t.grade !== f.grade)) err("ID_GRADE_MISMATCH", `templates grade-${f.grade}`, "Template grade differs from file grade");
    for (const t of f.templates) if (!t.id.startsWith(`t.g${t.grade}.`)) err("ID_GRADE_MISMATCH", t.id, `Template declares grade ${t.grade}`);
  }
  for (const w of c.worlds) {
    for (const u of w.units) if (u.grade !== w.grade || !u.id.startsWith(`G${w.grade}-`)) err("ID_GRADE_MISMATCH", u.id, `Unit is in the Grade ${w.grade} world`);
    for (const n of w.nodes) {
      if (!n.id.startsWith(`G${w.grade}-`)) err("ID_GRADE_MISMATCH", n.id, `Node is in the Grade ${w.grade} world`);
      if (n.unitId && !n.id.startsWith(`${n.unitId}-`)) err("ID_UNIT_MISMATCH", n.id, `Node id does not start with its unit ${n.unitId}`);
    }
  }
  for (const f of c.assessments) for (const a of f.assessments) if (a.grade !== f.grade || !a.id.startsWith(`a.g${a.grade}`)) err("ID_GRADE_MISMATCH", a.id, "Assessment grade mismatch");
  for (const s of c.book.sections) if (s.id !== `fs.g${s.grade}.s${String(s.section).padStart(2, "0")}`) err("ID_GRADE_MISMATCH", s.id, "Book section id does not match grade/section");
  for (const x of c.concepts.flatMap((f) => f.concepts)) {
    if (x.id.split(".")[1] !== x.domain) err("CONCEPT_DOMAIN_MISMATCH", x.id, `Concept id namespace must equal its domain "${x.domain}"`);
  }
}

function checkReferences(ix: CurriculumIndex, err: Reporter) {
  const { c } = ix;
  const has = {
    outcome: (id: string) => ix.outcomes.has(id),
    concept: (id: string) => ix.concepts.has(id),
    unit: (id: string) => ix.units.has(id),
    node: (id: string) => ix.nodeById.has(id),
    template: (id: string) => ix.templates.has(id),
    assessment: (id: string) => ix.assessments.has(id),
    family: (id: string) => ix.families.has(id),
    grader: (id: string) => c.engine.graders.some((g) => g.id === id),
    ruleset: (id: string) => c.engine.rulesets.some((r) => r.id === id),
    book: (id: string) => c.book.sections.some((s) => s.id === id),
  };
  const ref = (kind: keyof typeof has, id: string, where: string) => {
    if (!has[kind](id)) err("UNKNOWN_REF", where, `Unknown ${kind} "${id}"`);
  };
  for (const x of ix.concepts.values()) {
    x.prerequisiteIds.forEach((p) => ref("concept", p, x.id));
    x.rulesetIds.forEach((r) => ref("ruleset", r, x.id));
    x.outcomeIds.forEach((o) => ref("outcome", o, x.id));
  }
  for (const g of c.scope.grades) g.outcomeRefs.forEach((o) => ref("outcome", o, `grade-scope ${g.grade}`));
  for (const g of c.engine.graders) g.rulesetIds.forEach((r) => ref("ruleset", r, g.id));
  for (const f of ix.families.values()) ref("grader", f.graderId, f.id);
  for (const u of ix.units.values()) u.bookSectionIds.forEach((b) => ref("book", b, u.id));
  for (const n of ix.nodes) {
    if (n.unitId) ref("unit", n.unitId, n.id);
    n.conceptIds.forEach((x) => ref("concept", x, n.id));
    n.outcomeIds.forEach((x) => ref("outcome", x, n.id));
    n.reviewOutcomeIds.forEach((x) => ref("outcome", x, n.id));
    n.exerciseTemplateIds.forEach((x) => ref("template", x, n.id));
    n.bookSectionIds.forEach((x) => ref("book", x, n.id));
    (n.unlockAfter ?? []).forEach((x) => ref("node", x, n.id));
    if (n.assessmentId) ref("assessment", n.assessmentId, n.id);
  }
  for (const t of ix.templates.values()) {
    ref("family", t.familyId, t.id);
    t.outcomeIds.forEach((o) => ref("outcome", o, t.id));
    t.conceptIds.forEach((x) => ref("concept", x, t.id));
  }
  for (const a of ix.assessments.values()) {
    if (a.unitId) ref("unit", a.unitId, a.id);
    for (const s of a.sections) {
      s.outcomeIds.forEach((o) => ref("outcome", o, `${a.id}#${s.id}`));
      s.templateIds.forEach((t) => ref("template", t, `${a.id}#${s.id}`));
    }
  }
  for (const s of c.book.sections) {
    s.unitIds.forEach((u) => ref("unit", u, s.id));
    s.conceptIds.forEach((x) => ref("concept", x, s.id));
    s.outcomeIds.forEach((o) => ref("outcome", o, s.id));
    s.parts.forEach((p) => p.conceptIds.forEach((x) => ref("concept", x, `${s.id} (${p.topic})`)));
  }
}

function checkScopeTables(ix: CurriculumIndex, err: Reporter, warn: Reporter) {
  const grades = ix.c.scope.grades.map((g) => g.grade).sort();
  if (grades.join() !== "1,2,3,4,5") err("SCOPE_GRADES", "grade-scope", "Scope table must define Grades 1–5 exactly once each");
  // Key sets must match the official grade boundaries, derived from music rules rather than typed lists.
  const expected: Record<number, string[] | number> = {
    1: ["C major", "G major", "D major", "F major"],
    2: ["C major", "G major", "D major", "F major", "A major", "Bb major", "Eb major", "A minor", "E minor", "D minor"],
    3: 4,
    4: 5,
    5: 6,
  };
  for (const [gs, exp] of Object.entries(expected)) {
    const g = Number(gs);
    const keys = ix.cumulativeScope.get(g)?.keys ?? [];
    let parsed;
    try {
      parsed = keys.map(parseKey);
    } catch (e) {
      err("SCOPE_KEY", `grade-scope ${g}`, String(e));
      continue;
    }
    const want = typeof exp === "number" ? keysUpTo(exp) : exp.map(parseKey);
    const missing = want.filter((w) => !parsed.some((p) => sameKey(p, w))).map(formatKey);
    const extra = parsed.filter((p) => !want.some((w) => sameKey(p, w))).map(formatKey);
    if (missing.length || extra.length) {
      err("SCOPE_KEYS_MISMATCH", `grade-scope ${g}`, `Keys differ from the official boundary. Missing: [${missing.join(", ")}] Extra: [${extra.join(", ")}]`);
    }
  }
  for (const g of ix.c.scope.grades) {
    for (const ts of g.adds.timeSignatures ?? []) {
      let metre;
      try {
        metre = classifyTimeSignature(ts).metre;
      } catch (e) {
        err("SCOPE_TIME_SIGNATURE", `grade-scope ${g.grade}`, String(e));
        continue;
      }
      const ok = (g.grade <= 2 && metre === "simple") || (g.grade === 3 && metre === "compound") || (g.grade === 4 && metre !== "irregular") || (g.grade === 5 && metre === "irregular");
      if (!ok) err("SCOPE_TIME_SIGNATURE", `grade-scope ${g.grade}`, `${ts} (${metre}) is not introduced at Grade ${g.grade} by the official outline`);
    }
    const prev = ix.cumulativeScope.get(g.grade - 1) ?? {};
    for (const [k, v] of Object.entries(g.adds)) {
      if (Array.isArray(v)) {
        const dup = v.filter((x) => ((prev as Record<string, unknown[]>)[k] ?? []).includes(x));
        if (dup.length) warn("SCOPE_REDUNDANT", `grade-scope ${g.grade}`, `${k} re-adds ${dup.join(", ")}`);
      }
    }
  }
  const g2 = ix.cumulativeScope.get(2);
  if (g2?.minorForms?.includes("melodic")) err("SCOPE_MINOR_FORM", "grade-scope 2", "Melodic minor must not be in Grade 2 scope (official: harmonic only)");
  const g4 = ix.cumulativeScope.get(4);
  if (g4?.cadenceTypes?.length || g4?.inversions?.some((i) => i !== "a")) err("SCOPE_HARMONY", "grade-scope 4", "Cadences and inversions belong to Grade 5");
}

function checkConcepts(ix: CurriculumIndex, err: Reporter, warn: Reporter) {
  // Acyclic prerequisite graph.
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, stack: string[]) => {
    const s = state.get(id);
    if (s === "done") return;
    if (s === "visiting") {
      err("PREREQUISITE_CYCLE", id, `Cycle: ${[...stack, id].join(" → ")}`);
      return;
    }
    state.set(id, "visiting");
    for (const p of ix.concepts.get(id)?.prerequisiteIds ?? []) visit(p, [...stack, id]);
    state.set(id, "done");
  };
  for (const id of ix.concepts.keys()) visit(id, []);

  for (const x of ix.concepts.values()) {
    for (const p of x.prerequisiteIds) {
      const pc = ix.concepts.get(p);
      if (pc && pc.grade > x.grade) err("PREREQUISITE_FROM_LATER_GRADE", x.id, `Prerequisite ${p} is a Grade ${pc.grade} concept`);
      if (pc && pc.status === "enrichment" && x.status !== "enrichment") err("PREREQUISITE_IS_ENRICHMENT", x.id, `Prerequisite ${p} is optional enrichment`);
    }
    for (const o of x.outcomeIds) {
      const oc = ix.outcomes.get(o);
      if (oc && oc.grade > x.grade) err("CONCEPT_OUTCOME_LATER_GRADE", x.id, `Mapped to later-grade outcome ${o}`);
    }
    if (x.status === "core" && x.outcomeIds.length === 0) err("CORE_CONCEPT_WITHOUT_OUTCOME", x.id, "Core concepts must map to at least one official outcome");
    const taught = ix.conceptTaughtBy.get(x.id) ?? [];
    if (taught.length === 0) err("CONCEPT_NOT_TAUGHT", x.id, "No lesson teaches this concept");
    if (taught.length > 1) warn("CONCEPT_TAUGHT_TWICE", x.id, `Taught by ${taught.map((n) => n.id).join(", ")}; prefer one primary lesson plus review`);
    const first = taught[0];
    if (first && first.grade !== x.grade) err("CONCEPT_GRADE", x.id, `Concept declares Grade ${x.grade} but is first taught in Grade ${first.grade}`);
    if (first && x.status === "core" && first.optional) err("CORE_CONCEPT_ONLY_OPTIONAL", x.id, "Core concept is only taught in an optional node");
  }
}

function checkPath(ix: CurriculumIndex, err: Reporter, warn: Reporter) {
  for (const n of ix.nodes) {
    for (const p of n.resolvedUnlockAfter) {
      const pn = ix.nodeById.get(p);
      if (!pn) continue;
      if (pn.order >= n.order) err("UNLOCK_ORDER", n.id, `unlockAfter ${p} is not earlier in the path (would create a cycle or forward dependency)`);
      if (pn.optional && !n.optional) err("REQUIRED_DEPENDS_ON_OPTIONAL", n.id, `Required node depends on optional node ${p}`);
    }
    if (n.order > 0 && n.resolvedUnlockAfter.length === 0) err("UNREACHABLE", n.id, "Node has no unlock path");
    if (n.optional !== (n.type === "enrichment")) err("OPTIONAL_TYPE", n.id, "Only enrichment nodes are optional, and enrichment nodes must be optional");

    // Prerequisites must be taught before (or in) the node.
    if (n.type === "lesson" || n.type === "enrichment") {
      const available = conceptsAvailableAt(ix, n, false);
      const own = new Set(n.conceptIds);
      for (const cid of n.conceptIds) {
        for (const p of ix.concepts.get(cid)?.prerequisiteIds ?? []) {
          if (!available.has(p) && !own.has(p)) {
            err("UNTAUGHT_PREREQUISITE", n.id, `Concept ${cid} needs ${p}, which is not taught before this node`);
          }
        }
        if (ix.concepts.get(cid)?.grade !== undefined && ix.concepts.get(cid)!.grade > n.grade) {
          err("CONCEPT_BEYOND_GRADE", n.id, `Teaches later-grade concept ${cid}`);
        }
      }
    }
    if (n.type === "lesson") {
      if (n.conceptIds.length === 0) err("LESSON_WITHOUT_CONCEPT", n.id, "A lesson must teach at least one concept");
      if (n.outcomeIds.length === 0) err("LESSON_WITHOUT_OUTCOME", n.id, "A required lesson must serve at least one official outcome");
      if (n.exerciseTemplateIds.length === 0) err("LESSON_WITHOUT_PRACTICE", n.id, "A lesson must include practice exercises");
      for (const o of n.outcomeIds) {
        const oc = ix.outcomes.get(o);
        if (oc && oc.grade > n.grade) err("OUTCOME_BEYOND_GRADE", n.id, `Lesson targets later-grade outcome ${o}`);
      }
      for (const cid of n.conceptIds) {
        const x = ix.concepts.get(cid);
        if (x && x.outcomeIds.some((o) => !n.outcomeIds.includes(o))) warn("CONCEPT_OUTCOME_NOT_ON_LESSON", n.id, `${cid} maps to outcomes not listed on the lesson`);
      }
    }
    if (n.type === "practice" || n.type === "review") {
      if (n.reviewOutcomeIds.length === 0) err("REVIEW_WITHOUT_OUTCOMES", n.id, "Practice/review nodes must list the outcomes they revisit");
      if (n.exerciseTemplateIds.length === 0) err("REVIEW_WITHOUT_TEMPLATES", n.id, "Practice/review nodes need exercise templates");
      const taught = outcomesTaughtBefore(ix, n, false);
      for (const o of n.reviewOutcomeIds) if (!taught.has(o)) err("REVIEW_UNTAUGHT", n.id, `Reviews ${o}, which has not been taught before this node`);
      for (const o of n.reviewOutcomeIds) {
        const covered = n.exerciseTemplateIds.some((t) => ix.templates.get(t)?.outcomeIds.includes(o));
        if (!covered) err("REVIEW_OUTCOME_WITHOUT_TEMPLATE", n.id, `No listed template exercises ${o}`);
      }
    }
    if (n.type === "unit_challenge" || n.type === "grade_assessment") {
      const a = n.assessmentId ? ix.assessments.get(n.assessmentId) : undefined;
      if (!a) err("ASSESSMENT_NODE_WITHOUT_ASSESSMENT", n.id, "Challenge/assessment node must reference an assessment template");
      else {
        if (a.kind !== n.type) err("ASSESSMENT_KIND", n.id, `Node type ${n.type} references a ${a.kind}`);
        if (a.grade !== n.grade || a.unitId !== n.unitId) err("ASSESSMENT_PLACEMENT", n.id, `Assessment ${a.id} belongs to grade ${a.grade} / ${a.unitId}`);
      }
    }
    for (const t of n.exerciseTemplateIds) {
      const tpl = ix.templates.get(t);
      if (!tpl) continue;
      if (tpl.grade > n.grade) err("TEMPLATE_BEYOND_GRADE", n.id, `Uses Grade ${tpl.grade} template ${t}`);
      if (n.type === "lesson" || n.type === "enrichment") {
        const avail = conceptsAvailableAt(ix, n, true);
        if (!tpl.conceptIds.some((x) => avail.has(x))) err("TEMPLATE_CONCEPT_UNTAUGHT", n.id, `Template ${t} exercises no concept taught by this point`);
      }
    }
  }

  // Structure per unit and per grade.
  for (const w of ix.c.worlds) {
    for (const u of w.units) {
      const ns = w.nodes.filter((n) => n.unitId === u.id);
      const count = (t: string) => ns.filter((n) => n.type === t).length;
      if (count("lesson") < 2) warn("UNIT_FEW_LESSONS", u.id, "Unit has fewer than two lessons");
      if (count("practice") !== 1) err("UNIT_STRUCTURE", u.id, "Each unit needs exactly one practice node");
      if (count("review") < 1) err("UNIT_STRUCTURE", u.id, "Each unit needs at least one review node");
      if (count("unit_challenge") !== 1) err("UNIT_STRUCTURE", u.id, "Each unit needs exactly one unit challenge");
      const last = ns[ns.length - 1];
      if (last && last.type !== "unit_challenge") err("UNIT_STRUCTURE", u.id, "The unit challenge must be the unit's last node");
      const total = ns.filter((n) => n.type === "lesson").reduce((s, n) => s + n.estimatedMinutes, 0);
      if (ns.some((n) => n.type === "lesson" && n.estimatedMinutes > 12)) warn("LESSON_TOO_LONG", u.id, "A lesson exceeds 12 minutes; consider splitting");
      if (total === 0) err("UNIT_STRUCTURE", u.id, "Unit has no lessons");
    }
    const gas = w.nodes.filter((n) => n.type === "grade_assessment");
    if (gas.length !== 1 || w.nodes[w.nodes.length - 1]?.type !== "grade_assessment") {
      err("GRADE_STRUCTURE", `Grade ${w.grade}`, "Each grade must end with exactly one grade assessment");
    }
    const seq = w.units.map((u) => u.sequence);
    if (seq.join() !== seq.map((_, i) => i + 1).join()) err("GRADE_STRUCTURE", `Grade ${w.grade}`, "Unit sequence numbers must be 1..n in order");
  }
  const refs = new Map<string, number>();
  ix.nodes.forEach((n) => n.assessmentId && refs.set(n.assessmentId, (refs.get(n.assessmentId) ?? 0) + 1));
  for (const a of ix.assessments.values()) {
    if ((refs.get(a.id) ?? 0) !== 1) err("ASSESSMENT_NODE_COUNT", a.id, "Each assessment must be referenced by exactly one path node");
  }
}

function checkTemplates(ix: CurriculumIndex, err: Reporter, warn: Reporter) {
  const used = new Set([
    ...ix.nodes.flatMap((n) => n.exerciseTemplateIds),
    ...[...ix.assessments.values()].flatMap((a) => a.sections.flatMap((s) => s.templateIds)),
  ]);
  for (const t of ix.templates.values()) {
    const fam = ix.families.get(t.familyId);
    const grader = fam && ix.c.engine.graders.find((g) => g.id === fam.graderId);
    if (!fam || !grader) err("TEMPLATE_WITHOUT_GRADING", t.id, "Template must resolve to a family with a registered deterministic grader");
    else {
      if (fam.mistakeCategories.length + t.extraMistakeCategories.length === 0) err("TEMPLATE_WITHOUT_FEEDBACK", t.id, "No mistake-specific feedback");
      if (t.acceptance.multipleValidAnswers && !grader.supportsMultipleValidAnswers && fam.answerKind !== "choice") {
        err("MULTIPLE_ANSWERS_UNSUPPORTED", t.id, `Grader ${grader.id} cannot accept multiple valid answers`);
      }
      if (grader.answerKind !== fam.answerKind) err("GRADER_KIND_MISMATCH", fam.id, `Family answer kind ${fam.answerKind} ≠ grader ${grader.answerKind}`);
    }
    const limit = ix.cumulativeScope.get(t.grade) ?? {};
    for (const v of scopeViolations(t.scope, limit)) err("SCOPE_EXCEEDS_GRADE", t.id, `Grade ${t.grade} template: ${v}`);
    for (const o of t.outcomeIds) {
      const oc = ix.outcomes.get(o);
      if (oc && oc.grade > t.grade) err("TEMPLATE_OUTCOME_BEYOND_GRADE", t.id, `Targets later-grade outcome ${o}`);
    }
    for (const x of t.conceptIds) {
      const cc = ix.concepts.get(x);
      if (cc && cc.grade > t.grade) err("TEMPLATE_CONCEPT_BEYOND_GRADE", t.id, `Uses later-grade concept ${x}`);
    }
    if (!used.has(t.id)) warn("UNUSED_TEMPLATE", t.id, "Template is not used by any node or assessment");
    for (const k of t.scope.keys ?? []) {
      try {
        parseKey(k);
      } catch (e) {
        err("TEMPLATE_KEY", t.id, String(e));
      }
    }
  }
  for (const f of ix.families.values()) {
    const ids = f.mistakeCategories.map((m) => m.id);
    if (new Set(ids).size !== ids.length) err("DUPLICATE_MISTAKE_CATEGORY", f.id, "Mistake category ids must be unique within a family");
  }
}

function checkAssessments(ix: CurriculumIndex, err: Reporter) {
  for (const a of ix.assessments.values()) {
    const all = new Set(a.sections.flatMap((s) => s.outcomeIds));
    for (const s of a.sections) {
      for (const o of s.outcomeIds) {
        const oc = ix.outcomes.get(o);
        if (oc && oc.grade > a.grade) err("ASSESSMENT_BEYOND_GRADE", `${a.id}#${s.id}`, `Includes later-grade outcome ${o}`);
      }
      for (const t of s.templateIds) {
        const tpl = ix.templates.get(t);
        if (!tpl) continue;
        if (tpl.grade > a.grade) err("ASSESSMENT_BEYOND_GRADE", `${a.id}#${s.id}`, `Uses Grade ${tpl.grade} template ${t}`);
        if (!tpl.outcomeIds.some((o) => s.outcomeIds.includes(o))) err("ASSESSMENT_TEMPLATE_MISMATCH", `${a.id}#${s.id}`, `Template ${t} does not target any of the section's outcomes`);
        if (tpl.conceptIds.every((x) => ix.concepts.get(x)?.status === "enrichment")) err("ASSESSMENT_ENRICHMENT", `${a.id}#${s.id}`, `Template ${t} only exercises enrichment concepts`);
      }
      for (const o of s.outcomeIds) {
        if (!s.templateIds.some((t) => ix.templates.get(t)?.outcomeIds.includes(o))) err("ASSESSMENT_OUTCOME_WITHOUT_TEMPLATE", `${a.id}#${s.id}`, `No template in the section assesses ${o}`);
      }
    }
    if (a.kind === "grade_assessment") {
      for (const o of ix.outcomes.values()) {
        if (o.grade === a.grade && !all.has(o.id)) err("GRADE_ASSESSMENT_INCOMPLETE", a.id, `Does not sample ${o.id}`);
      }
    } else if (a.unitId) {
      const taught = ix.nodes.filter((n) => n.unitId === a.unitId && n.type === "lesson").flatMap((n) => n.outcomeIds);
      for (const o of new Set(taught)) if (!all.has(o)) err("UNIT_CHALLENGE_INCOMPLETE", a.id, `Does not assess ${o}, taught in ${a.unitId}`);
      const node = ix.nodes.find((n) => n.assessmentId === a.id);
      if (node) {
        const available = outcomesTaughtBefore(ix, node, false);
        for (const o of all) if (!available.has(o)) err("CHALLENGE_UNTAUGHT", a.id, `Assesses ${o} before it is taught`);
      }
    }
  }
}

function checkCoverage(ix: CurriculumIndex, err: Reporter) {
  for (const row of computeCoverage(ix)) {
    for (const m of row.missing) {
      const code = { lesson: "OUTCOME_NO_LESSON", practice: "OUTCOME_NO_PRACTICE", review: "OUTCOME_NO_REVIEW", assessment: "OUTCOME_NO_ASSESSMENT", "grade-assessment": "OUTCOME_NO_GRADE_ASSESSMENT" }[m];
      err(code, row.outcomeId, `Official outcome has no ${m}`);
    }
  }
}

function checkBook(ix: CurriculumIndex, err: Reporter, warn: Reporter) {
  const { book } = ix.c;
  if (book.sections.length !== 75) err("BOOK_SECTION_COUNT", "source-book", `Expected 75 sections, found ${book.sections.length}`);
  for (const [g, count] of Object.entries(BOOK_SECTION_COUNTS)) {
    const secs = book.sections.filter((s) => s.grade === Number(g));
    if (secs.length !== count) err("BOOK_SECTION_COUNT", `Grade ${g}`, `Expected ${count} sections, found ${secs.length}`);
    secs.forEach((s, i) => {
      if (s.section !== i + 1) err("BOOK_SECTION_ORDER", s.id, `Expected section ${i + 1}`);
    });
  }
  let lastPage = 0;
  for (const s of book.sections) {
    if (s.printedPage < lastPage) err("BOOK_PAGE_ORDER", s.id, `Printed page ${s.printedPage} is before the previous section's page ${lastPage}`);
    lastPage = s.printedPage;
    const expectScan = 8 + Math.floor(s.printedPage / 2);
    if (s.scanPage !== expectScan) err("BOOK_SCAN_PAGE", s.id, `Scan page should be ${expectScan} for printed page ${s.printedPage}`);
    if (s.classification === "core_this_grade" && s.taughtAtGrade !== s.grade) err("BOOK_CLASSIFICATION", s.id, "core_this_grade sections must be taught at their own grade");
    if (s.classification === "core_other_grade" && s.taughtAtGrade === s.grade) err("BOOK_CLASSIFICATION", s.id, "core_other_grade sections must be taught at a different grade");
    const isCore = s.classification === "core_this_grade" || s.classification === "core_other_grade";
    if (isCore && s.outcomeIds.length === 0) err("BOOK_CORE_UNMAPPED", s.id, "Core section must map to at least one official outcome");
    const taughtRequired = s.conceptIds.filter((x) => (ix.conceptTaughtBy.get(x) ?? []).some((n) => !n.optional));
    if (isCore && taughtRequired.length === 0) err("BOOK_CORE_UNMAPPED", s.id, "Core section's concepts are not taught in any required lesson");
    for (const x of s.conceptIds) {
      const cc = ix.concepts.get(x);
      const taughtGrade = ix.conceptTaughtBy.get(x)?.[0]?.grade;
      if (cc && isCore && taughtGrade && taughtGrade !== s.taughtAtGrade && !s.parts.some((p) => p.conceptIds.includes(x))) {
        warn("BOOK_GRADE_DRIFT", s.id, `Concept ${x} is taught at Grade ${taughtGrade}, not ${s.taughtAtGrade}`);
      }
    }
    for (const o of s.outcomeIds) {
      const oc = ix.outcomes.get(o);
      if (oc && oc.grade > s.taughtAtGrade) err("BOOK_OUTCOME_GRADE", s.id, `Mapped outcome ${o} is above the section's teaching grade`);
    }
    const unitsTeaching = new Set(
      s.conceptIds.flatMap((x) => (ix.conceptTaughtBy.get(x) ?? []).map((n) => n.unitId ?? "")),
    );
    if (!s.unitIds.some((u) => unitsTeaching.has(u))) err("BOOK_UNIT_MISMATCH", s.id, "None of the listed units teaches the section's concepts");
    for (const p of s.parts) {
      if (p.classification === "core_other_grade" && (p.taughtAtGrade === null || p.taughtAtGrade === s.grade)) {
        err("BOOK_PART_CLASSIFICATION", s.id, `Part "${p.topic}" is core at another grade but taughtAtGrade is ${p.taughtAtGrade}`);
      }
      if (p.classification === "no_current_match" && p.conceptIds.length) err("BOOK_PART_CLASSIFICATION", s.id, `Part "${p.topic}" has no current match but maps concepts`);
    }
  }
  for (const u of ix.units.values()) {
    for (const b of u.bookSectionIds) {
      const s = book.sections.find((x) => x.id === b);
      if (s && !s.unitIds.includes(u.id)) err("BOOK_UNIT_MISMATCH", u.id, `Lists ${b}, but that section does not list this unit`);
    }
  }
  for (const s of book.sections) {
    for (const u of s.unitIds) {
      if (!ix.units.get(u)?.bookSectionIds.includes(s.id)) err("BOOK_UNIT_MISMATCH", s.id, `Lists unit ${u}, but that unit does not list this section`);
    }
  }
  // Every required lesson should be traceable to the book or to an explicit gap (no book section).
  for (const n of ix.nodes) {
    if (n.type === "lesson" && n.bookSectionIds.length === 0 && !n.conceptIds.some((x) => x.startsWith("c.context."))) {
      warn("LESSON_WITHOUT_SOURCE", n.id, "Lesson has no source-book pointer; confirm it is an intentional syllabus gap fill");
    }
  }
}

const LEARNER_TEXT_BLOCKLIST: Array<[RegExp, string]> = [
  [/first steps in music theory/i, "names the reference book"],
  [/eric taylor/i, "names the reference book's author"],
  [/\babrsm\b/i, "mentions the exam board in learner-facing text (risk of implied endorsement)"],
  [/\bofficial (exam|certificate|pass)/i, "implies an official exam or certificate"],
];

function learnerStrings(value: unknown, path: string, out: Array<[string, string]>) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => learnerStrings(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) if (k !== "provenance") learnerStrings(v, `${path}.${k}`, out);
  }
}

function checkProvenance(ix: CurriculumIndex, repoRoot: string, err: Reporter) {
  // 1. No copyrighted reference files in the repository.
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git") continue;
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(pdf|djvu|epub)$/i.test(name)) err("PROHIBITED_FILE", relative(repoRoot, p), "Reference documents (e.g. the source-book scan) must never be committed");
    }
  };
  if (existsSync(repoRoot)) walk(repoRoot);

  // 2. Learner-facing lesson/item text must not cite the book or imply endorsement.
  const docs: Array<[string, unknown]> = [
    ...ix.c.lessons.map((l) => [l.file, l.content] as [string, unknown]),
    ...ix.c.items.map((i) => [i.file, i.content.item] as [string, unknown]),
  ];
  for (const [file, content] of docs) {
    const strings: Array<[string, string]> = [];
    learnerStrings(content, "", strings);
    for (const [path, text] of strings) {
      for (const [re, why] of LEARNER_TEXT_BLOCKLIST) if (re.test(text)) err("LEARNER_TEXT_PROVENANCE", `${file}${path}`, `Learner-facing text ${why}`);
    }
  }
  for (const n of ix.nodes) {
    for (const [re, why] of LEARNER_TEXT_BLOCKLIST) {
      if (re.test(n.title) || re.test(n.objective)) err("LEARNER_TEXT_PROVENANCE", n.id, `Node title/objective ${why}`);
    }
  }
  // 3. Lesson content files are linked from exactly one node.
  for (const l of ix.c.lessons) {
    const node = ix.nodeById.get(l.content.lessonId);
    if (!node) err("LESSON_CONTENT_ORPHAN", l.file, `No path node ${l.content.lessonId}`);
    else if (node.contentRef !== l.file) err("LESSON_CONTENT_LINK", l.file, `Node ${node.id} has contentRef ${String(node.contentRef)}`);
    if (l.content.id !== `lc.${l.content.lessonId}`) err("LESSON_CONTENT_ID", l.file, "Lesson content id must be lc.<lessonId>");
  }
  for (const n of ix.nodes) {
    if (n.contentRef && !ix.c.lessons.some((l) => l.file === n.contentRef)) err("LESSON_CONTENT_MISSING", n.id, `contentRef ${n.contentRef} not found`);
    if ((n.contentStatus === "example" || n.contentStatus === "approved") && !n.contentRef) err("LESSON_CONTENT_MISSING", n.id, `contentStatus ${n.contentStatus} needs a contentRef`);
  }
}

function checkReleaseClaims(ix: CurriculumIndex, release: boolean, err: Reporter, warn: Reporter) {
  const r = ix.c.release;
  const report = release ? err : warn;
  const teacherApproved = r.teacherReview.status === "approved" && r.teacherReview.signedOffAt !== null;
  if (r.status === "approved" && !teacherApproved) err("COVERAGE_CLAIM_WITHOUT_REVIEW", "release", "Release cannot be approved without teacher sign-off");
  if (r.publishedAt && r.status !== "approved") err("PUBLISHED_UNAPPROVED", "release", "Only approved releases may have a publication date");
  if (!teacherApproved) report("RELEASE_TEACHER_REVIEW", "release", "No teacher sign-off: coverage is planned, not verified");
  if (r.syllabus.newerRevisionCheck.result !== "none_found") report("RELEASE_SYLLABUS_CURRENCY", "release", `Syllabus currency check is "${r.syllabus.newerRevisionCheck.result}"`);
  const unapprovedOutcomes = ix.c.syllabus.outcomes.filter((o) => o.teacherReview !== "approved").length;
  if (unapprovedOutcomes) report("RELEASE_OUTCOMES_UNREVIEWED", "syllabus", `${unapprovedOutcomes} outcome decompositions await teacher review`);
  const unapprovedTemplates = [...ix.templates.values()].filter((t) => t.qa.status !== "approved").length;
  if (unapprovedTemplates) report("RELEASE_TEMPLATES_UNREVIEWED", "templates", `${unapprovedTemplates} exercise templates are not approved`);
  const planned = ix.nodes.filter((n) => n.contentStatus !== "approved").length;
  if (release && planned) err("RELEASE_CONTENT_INCOMPLETE", "path", `${planned} nodes have no approved content`);
  if (ix.c.release.scope.grades.join() !== "1,2,3,4,5") err("RELEASE_SCOPE", "release", "Scope must be Grades 1–5");
  if (!ID_PATTERNS.outcome.test(ix.c.syllabus.outcomes[0]?.id ?? "")) err("RELEASE_SCOPE", "syllabus", "Unexpected outcome id scheme");
}
