/**
 * Musical verification of authored lesson content and exercise items.
 *
 * Every answer that can be derived from the notation is re-derived here with the reference
 * music rules and compared with what the author typed. This catches wrong answers, missing
 * alternatives (e.g. a second valid cadence chord), incorrect accidentals and bars that do not
 * add up — before a teacher ever sees the content.
 */
import type { Issue } from "./load.ts";
import type { CurriculumIndex } from "./model.ts";
import {
  barCapacity,
  classifyCadence,
  dotted,
  equals,
  add,
  formatKey,
  formatPitch,
  frac,
  keySignature,
  ledgerLines,
  parseInterval,
  parseKey,
  parsePitch,
  parseTimeSignature,
  samePitchClassSpelling,
  sameKey,
  signatureAlter,
  transpose,
  triadContains,
  type Fraction,
  type Key,
  type Pitch,
} from "./music/index.ts";
import type { ExerciseItem, MusicScope, NotationFragment } from "./schema.ts";

const ROMANS = ["I", "ii", "IV", "V"] as const;
const ACCIDENTAL_ALTER: Record<string, number> = { sharp: 1, flat: -1, natural: 0, "double-sharp": 2, "double-flat": -2 };

type Report = (code: string, where: string, message: string, severity?: "error" | "warning") => void;

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));
}

function notesOf(music: NotationFragment) {
  return music.measures.flatMap((m) => m.events.filter((e) => e.kind === "note"));
}

/** Checks bar totals, accidental spelling consistency and grade scope of a notation fragment. */
export function checkFragment(music: NotationFragment, scope: MusicScope, where: string, report: Report) {
  if (!(scope.clefs ?? []).includes(music.clef)) report("FRAGMENT_SCOPE", where, `Clef ${music.clef} is not yet in scope`);
  if (music.key && !(scope.keys ?? []).includes(music.key)) report("FRAGMENT_SCOPE", where, `Key ${music.key} is not yet in scope`);
  if (music.timeSignature && !(scope.timeSignatures ?? []).includes(music.timeSignature)) {
    report("FRAGMENT_SCOPE", where, `Time signature ${music.timeSignature} is not yet in scope`);
  }
  const key: Key | undefined = music.key ? parseKey(music.key) : undefined;
  const capacity = music.timeSignature ? barCapacity(parseTimeSignature(music.timeSignature)) : undefined;
  music.measures.forEach((m, bar) => {
    const state = new Map<string, number>();
    let total: Fraction = frac(0);
    for (const e of m.events) {
      if ((e.duration.dots ?? 0) > (scope.maxDots ?? 0)) report("FRAGMENT_SCOPE", where, `Bar ${bar + 1}: ${e.duration.dots} dots exceed scope`);
      if (!(scope.noteValues ?? []).includes(e.duration.value)) report("FRAGMENT_SCOPE", where, `Bar ${bar + 1}: ${e.duration.value} not yet in scope`);
      total = add(total, dotted(e.duration.value, e.duration.dots ?? 0));
      if (e.kind !== "note") continue;
      const p = parsePitch(e.pitch);
      const lines = ledgerLines(music.clef, p);
      if (lines > (scope.maxLedgerLines ?? 0)) report("FRAGMENT_SCOPE", where, `Bar ${bar + 1}: ${e.pitch} needs ${lines} ledger lines (limit ${scope.maxLedgerLines ?? 0})`);
      const slot = `${p.step}${p.octave}`;
      const fromSignature = key && music.showKeySignature !== false ? signatureAlter(key, p.step) : 0;
      const expected = state.get(slot) ?? fromSignature;
      if (e.writtenAccidental !== undefined) {
        const alter = ACCIDENTAL_ALTER[e.writtenAccidental]!;
        if (alter !== p.alter) report("ACCIDENTAL_MISMATCH", where, `Bar ${bar + 1}: ${e.pitch} is written with a ${e.writtenAccidental} sign`);
        if (alter === expected) report("ACCIDENTAL_REDUNDANT", where, `Bar ${bar + 1}: the ${e.writtenAccidental} before ${e.pitch} is unnecessary`, "warning");
        state.set(slot, alter);
      } else if (p.alter !== expected) {
        report("ACCIDENTAL_MISSING", where, `Bar ${bar + 1}: ${e.pitch} needs a written accidental (key signature/bar state gives a different note)`);
      }
    }
    if (capacity && !equals(total, capacity)) {
      report("BAR_DURATION", where, `Bar ${bar + 1} lasts ${total.n}/${total.d} of a semibreve; ${music.timeSignature} needs ${capacity.n}/${capacity.d}`);
    }
  });
}

/** Re-derive the answer of an item where possible and compare with the authored answer. */
export function checkItemAnswer(item: ExerciseItem, scope: MusicScope, where: string, report: Report) {
  const a = item.answer;
  if (a.kind === "choice") {
    const ids = a.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) report("CHOICE_DUPLICATE", where, "Option ids must be unique");
    for (const c of a.correctOptionIds) if (!ids.includes(c)) report("CHOICE_UNKNOWN", where, `Correct option ${c} is not an option`);
    if (a.correctOptionIds.length === ids.length) report("CHOICE_TRIVIAL", where, "Every option is correct");
    return;
  }
  if (a.kind === "pitch") {
    const notes = item.music ? notesOf(item.music) : [];
    if (notes.length === 1) {
      const shown = parsePitch(notes[0]!.pitch);
      const ok = a.accepted.some((acc) => {
        const p = parsePitch(acc);
        return samePitchClassSpelling(p, shown) && (!a.octaveSensitive || p.octave === shown.octave);
      });
      if (!ok) report("ANSWER_MISMATCH", where, `Shown note is ${notes[0]!.pitch} but accepted answers are ${a.accepted.join(", ")}`);
    }
    return;
  }
  if (a.kind === "staff-position") {
    for (const acc of a.accepted) {
      const lines = ledgerLines(a.clef, parsePitch(acc));
      if (lines > (scope.maxLedgerLines ?? 0)) report("ANSWER_SCOPE", where, `Accepted ${acc} needs ${lines} ledger lines in the ${a.clef} clef`);
    }
    return;
  }
  if (a.kind === "pitch-sequence") {
    if (!item.music) {
      report("ANSWER_UNVERIFIABLE", where, "Transposition item has no source music");
      return;
    }
    const source = parseKey(a.derivation.sourceKey);
    if (!item.music.key || !sameKey(parseKey(item.music.key), source)) report("TRANSPOSE_SOURCE_KEY", where, `Source key ${a.derivation.sourceKey} ≠ music key ${String(item.music.key)}`);
    const interval = parseInterval(a.derivation.interval);
    const tonic: Pitch = { ...source.tonic, octave: 4 };
    const newTonic = transpose(tonic, interval, a.derivation.direction);
    const derivedKey: Key = { tonic: { step: newTonic.step, alter: newTonic.alter }, mode: source.mode };
    try {
      keySignature(derivedKey);
    } catch (e) {
      report("TRANSPOSE_KEY", where, String(e));
      return;
    }
    if (!sameKey(derivedKey, parseKey(a.key))) report("TRANSPOSE_KEY", where, `Answer key ${a.key}; derived ${formatKey(derivedKey)}`);
    if (!(scope.keys ?? []).includes(formatKey(derivedKey))) report("TRANSPOSE_KEY", where, `Derived key ${formatKey(derivedKey)} is not in scope`);
    const derived = notesOf(item.music).map((n) => formatPitch(transpose(parsePitch(n.pitch), interval, a.derivation.direction)));
    const first = a.accepted[0] ?? [];
    if (derived.join(" ") !== first.join(" ")) report("ANSWER_MISMATCH", where, `Derived transposition: ${derived.join(" ")}; authored: ${first.join(" ")}`);
    for (const p of derived) {
      const lines = ledgerLines(a.clef, parsePitch(p));
      if (lines > (scope.maxLedgerLines ?? 0)) report("ANSWER_SCOPE", where, `${p} needs ${lines} ledger lines`);
    }
    return;
  }
  if (a.kind === "chord-progression") {
    const key = parseKey(a.key);
    if (item.music?.key && !sameKey(parseKey(item.music.key), key)) report("CADENCE_KEY", where, `Answer key ${a.key} ≠ music key ${item.music.key}`);
    if (!(scope.cadenceKeys ?? []).includes(a.key)) report("CADENCE_KEY", where, `Cadence key ${a.key} is outside the official cadence keys`);
    const candidates = new Map<string, string[]>();
    for (const p of a.points) {
      const labelled = item.music ? notesOf(item.music).filter((n) => n.label === p.label).map((n) => n.pitch) : [];
      if (item.music && !sameSet(labelled, p.melodyPitches)) report("CADENCE_LABELS", where, `Point ${p.label}: score shows [${labelled.join(", ")}], answer lists [${p.melodyPitches.join(", ")}]`);
      const pcs = p.melodyPitches.map(parsePitch);
      candidates.set(p.label, ROMANS.filter((r) => pcs.every((pc) => triadContains(key, r, pc))));
    }
    const derived = new Map<string, Set<string>>();
    a.points.forEach((p) => derived.set(p.label, new Set(candidates.get(p.label))));
    for (const cad of a.cadences) {
      const [l1, l2] = cad.labels;
      const valid: Array<[string, string, string]> = [];
      for (const r1 of candidates.get(l1) ?? []) {
        for (const r2 of candidates.get(l2) ?? []) {
          const type = classifyCadence(r1, r2);
          if (type) valid.push([r1, r2, type]);
        }
      }
      if (!valid.length) report("CADENCE_UNSOLVABLE", where, `No valid cadence for ${l1}–${l2}`);
      derived.set(l1, new Set([...(derived.get(l1) ?? [])].filter((r) => valid.some((v) => v[0] === r))));
      derived.set(l2, new Set([...(derived.get(l2) ?? [])].filter((r) => valid.some((v) => v[1] === r))));
      const types = Array.from(new Set(valid.map((v) => v[2])));
      if (!sameSet(types, cad.acceptedTypes)) report("CADENCE_TYPE_MISMATCH", where, `${l1}–${l2}: derived ${types.join("/")}, authored ${cad.acceptedTypes.join("/")}`);
    }
    for (const p of a.points) {
      const d = [...(derived.get(p.label) ?? [])];
      if (!sameSet(d, p.accepted)) report("ANSWER_MISMATCH", where, `Point ${p.label}: derived valid chords [${d.join(", ")}], authored [${p.accepted.join(", ")}]`);
    }
  }
}

export function verifyLessonMusic(ix: CurriculumIndex): Issue[] {
  const issues: Issue[] = [];
  const report: Report = (code, where, message, severity = "error") => issues.push({ code, severity, message, where });

  const checkItem = (item: ExerciseItem, gradeLimit: number, where: string, allowedTemplates: string[] | null, expectedEvidence?: string) => {
    const tpl = ix.templates.get(item.templateId);
    if (!tpl) {
      report("UNKNOWN_REF", where, `Unknown template ${item.templateId}`);
      return;
    }
    if (tpl.version !== item.templateVersion) report("TEMPLATE_VERSION", where, `Item targets v${item.templateVersion}, template is v${tpl.version}`);
    if (allowedTemplates && !allowedTemplates.includes(tpl.id)) report("ITEM_TEMPLATE_NOT_ON_NODE", where, `${tpl.id} is not listed on the lesson node`);
    if (tpl.grade > gradeLimit) report("TEMPLATE_BEYOND_GRADE", where, `Grade ${tpl.grade} template used in Grade ${gradeLimit}`);
    if (expectedEvidence && item.evidence !== expectedEvidence) report("ITEM_EVIDENCE", where, `Expected evidence "${expectedEvidence}"`);
    const fam = ix.families.get(tpl.familyId);
    if (fam) {
      const known = new Set([...fam.mistakeCategories, ...tpl.extraMistakeCategories].map((m) => m.id));
      for (const k of Object.keys(item.feedback.mistakes)) if (!known.has(k)) report("FEEDBACK_UNKNOWN_CATEGORY", where, `Mistake category "${k}" is not defined for ${fam.id}`);
      if (Object.keys(item.feedback.mistakes).length === 0) report("ITEM_WITHOUT_FEEDBACK", where, "Item needs at least one mistake-specific feedback message");
      if (item.answer.kind !== "choice" && item.answer.kind !== fam.answerKind) {
        report("ANSWER_KIND", where, `Answer kind ${item.answer.kind} does not match family answer kind ${fam.answerKind}`);
      }
    }
    const scope = ix.cumulativeScope.get(gradeLimit) ?? {};
    if (item.music) checkFragment(item.music, scope, where, report);
    checkItemAnswer(item, scope, where, report);
  };

  for (const { file, content } of ix.c.lessons) {
    const node = ix.nodeById.get(content.lessonId);
    if (!node) continue; // reported elsewhere
    const scope = ix.cumulativeScope.get(node.grade) ?? {};
    content.explanation.forEach((b, i) => b.kind === "notation" && checkFragment(b.music, scope, `${file}#explanation[${i}]`, report));
    checkFragment(content.demonstration.music, scope, `${file}#demonstration`, report);
    content.guided.forEach((it) => checkItem(it, node.grade, `${file}#${it.id}`, node.exerciseTemplateIds, "learning"));
    content.independent.forEach((it) => checkItem(it, node.grade, `${file}#${it.id}`, node.exerciseTemplateIds, "independent"));
    for (const x of content.mastery.conceptIds) if (!node.conceptIds.includes(x)) report("MASTERY_CONCEPT", file, `${x} is not taught by ${node.id}`);
    for (const o of content.provenance.outcomeIds) if (!node.outcomeIds.includes(o)) report("PROVENANCE_OUTCOME", file, `${o} is not an outcome of ${node.id}`);
    for (const b of content.provenance.bookSectionIds) if (!node.bookSectionIds.includes(b)) report("PROVENANCE_BOOK", file, `${b} is not listed on ${node.id}`, "warning");
    for (const r of content.spacedReview) {
      const t = ix.templates.get(r.templateId);
      if (!t) report("UNKNOWN_REF", file, `Spaced review template ${r.templateId} not found`);
      else if (t.grade > node.grade) report("TEMPLATE_BEYOND_GRADE", file, `Spaced review uses Grade ${t.grade} template`);
    }
    const days = content.spacedReview.map((r) => r.afterDays);
    if (days.some((d, i) => i > 0 && d <= days[i - 1]!)) report("SPACED_REVIEW_ORDER", file, "Spaced review intervals must increase");
  }
  for (const { file, content } of ix.c.items) {
    const tpl = ix.templates.get(content.item.templateId);
    if (!tpl) {
      report("UNKNOWN_REF", file, `Unknown template ${content.item.templateId}`);
      continue;
    }
    for (const o of content.outcomeIds) if (!tpl.outcomeIds.includes(o)) report("PROVENANCE_OUTCOME", file, `${o} is not targeted by ${tpl.id}`);
    checkItem(content.item, tpl.grade, `${file}#${content.item.id}`, null);
  }
  return issues;
}
