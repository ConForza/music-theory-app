/**
 * Seeded exercise generation. `generateItem(ix, templateId, seed)` is a pure function: the same template
 * version and seed always produce the same question and correct answer.
 *
 * Every draft passes three gates before it is returned:
 *  1. the curriculum's music verifier (`checkItem`): scope, bar totals, accidental spelling and every
 *     accepted answer re-derived from the rules;
 *  2. the generator's own ambiguity checks (e.g. a time-signature question whose grouping would also fit
 *     another metre is rejected);
 *  3. solvability: the engine must grade the canonical correct answer as correct and a known wrong answer
 *     as incorrect.
 * A draft that fails is discarded and the generator retries from the same seeded stream, so retries stay
 * deterministic.
 */
import {
  checkItem,
  music,
  type CurriculumIndex,
  type ExerciseItem,
  type ExerciseTemplate,
  type MusicScope,
} from "@mtp/curriculum";
import { EngineError, itemContext, templateScope } from "../context.ts";
import { gradeItem } from "../grade.ts";
import { hashString, rng as makeRng, type Rng } from "../rng.ts";
import { canonicalResponse, wrongResponse } from "./canonical.ts";
import { GENERATORS, type Draft } from "./families.ts";
import { GRADE1_GENERATORS } from "./grade1.ts";
import { GRADE2_GENERATORS } from "./grade2.ts";
import { GRADE3_GENERATORS } from "./grade3.ts";
import { GRADE4_GENERATORS } from "./grade4.ts";
import { GRADE5_GENERATORS } from "./grade5.ts";

export { canonicalResponse, wrongResponse } from "./canonical.ts";

export interface GeneratedItem {
  item: ExerciseItem;
  meta: {
    templateId: string;
    templateVersion: number;
    seed: number;
    grade: number;
    outcomeIds: string[];
    conceptIds: string[];
    familyId: string;
    /** Review status: the template's QA status; generated variants are never individually teacher-reviewed. */
    review: { templateQa: string; generated: true; humanReviewed: false };
    /** How the item is answered without sight or sound (from the family's accessibility contract). */
    accessibleEquivalent: string;
  };
}

const generatorFor = (t: ExerciseTemplate) => GRADE1_GENERATORS[t.id] ?? GRADE2_GENERATORS[t.id] ?? GRADE3_GENERATORS[t.id] ?? GRADE4_GENERATORS[t.id] ?? GRADE5_GENERATORS[t.id] ?? GENERATORS[t.familyId]?.(t);
export const generatorTemplateIds = (ix: CurriculumIndex): string[] => [...ix.templates.values()].filter((t) => generatorFor(t) !== undefined).map((t) => t.id);

/**
 * Bump when generator code changes what any (template, version, seed) produces. Together with the template,
 * the effective scope and the shared vocabularies it forms the generation fingerprint carried in every id, so
 * an id never silently regenerates a different question after an update (it is refused as stale instead).
 */
export const GENERATOR_REVISION = 1;

const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;

export function generationFingerprint(t: ExerciseTemplate, scope: MusicScope): string {
  // Grade 4 and Grade 5 vocabularies are versioned and join the fingerprint of their own grade's templates only: Grade 1-3 identities are byte-for-byte unchanged.
  const inputs = { rev: GENERATOR_REVISION, template: t, scope, vocab: { terms: music.TERMS, instruments: music.INSTRUMENTS, voices: music.VOICES }, ...(t.grade === 4 ? { vocab4: music.VOCAB_G4 } : {}), ...(t.grade === 5 ? { vocab5: music.VOCAB_G5 } : {}) };
  return hashString(JSON.stringify(canonical(inputs))).toString(16).padStart(8, "0");
}

export function generatedItemId(templateId: string, version: number, seed: number, fingerprint: string): string {
  return `i.gen.${templateId.slice(2).replace(/\./g, "-")}.v${version}.s${seed}.f${fingerprint}`;
}

/** Parse a generated item id back into its template, version, seed and generation fingerprint. */
export function parseGeneratedItemId(id: string): { templateId: string; version: number; seed: number; fingerprint: string } | null {
  const m = /^i\.gen\.(g[1-5])-([a-z0-9-]+)\.v(\d+)\.s(\d+)\.f([0-9a-f]{8})$/.exec(id);
  if (!m) return null;
  return { templateId: `t.${m[1]}.${m[2]}`, version: Number(m[3]), seed: Number(m[4]), fingerprint: m[5]! };
}

function finish(ix: CurriculumIndex, t: ExerciseTemplate, seed: number, d: Draft, evidence: "learning" | "independent", fingerprint: string): ExerciseItem {
  const fam = ix.families.get(t.familyId)!;
  const mistakes = Object.fromEntries([...fam.mistakeCategories, ...t.extraMistakeCategories].map((m) => [m.id, m.feedback]));
  return {
    id: generatedItemId(t.id, t.version, seed, fingerprint),
    templateId: t.id,
    templateVersion: t.version,
    seed,
    evidence,
    prompt: d.prompt,
    ...(d.music ? { music: d.music } : {}),
    ...(d.score ? { score: d.score } : {}),
    answer: d.answer,
    hints: [...t.hints, ...(d.hints ?? [])].slice(0, 4),
    feedback: { correct: d.correct ?? fam.correctFeedback, mistakes, fallback: fam.fallbackFeedback },
  };
}

export interface GenerateOptions {
  /** The scope to sample from (a lesson binding's effective scope). Defaults to the template's grade scope. */
  scope?: MusicScope;
  evidence?: "learning" | "independent";
  /** Template version requested; generation fails if the content has moved on (stale ids are never regraded). */
  version?: number;
  /** Fingerprint from a delivered id; generation fails with stale_item if any generation input has changed. */
  fingerprint?: string;
}

export function generateItem(ix: CurriculumIndex, templateId: string, seed: number, opts: GenerateOptions = {}): GeneratedItem {
  const t = ix.templates.get(templateId);
  if (!t) throw new EngineError("unknown_template", `Unknown template ${templateId}`);
  if (opts.version !== undefined && opts.version !== t.version) throw new EngineError("stale_item", `Template ${templateId} is now version ${t.version}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 31 - 1) throw new EngineError("unsupported", "Seed must be a non-negative 31-bit integer");
  const gen = generatorFor(t);
  if (!gen) throw new EngineError("unsupported", `No generator for ${templateId}`);
  const scope = opts.scope ?? templateScope(ix, t);
  const fingerprint = generationFingerprint(t, scope);
  if (opts.fingerprint !== undefined && opts.fingerprint !== fingerprint) throw new EngineError("stale_item", `${templateId} has changed since this question was made`);
  const fam = ix.families.get(t.familyId)!;
  const problems: string[] = [];
  // Two deterministic streams: the main one, then a longer fallback stream. Same seed → same item, always.
  const streams: Array<[Rng, number]> = [[makeRng(seed, `${t.id}@${t.version}`), 40], [makeRng(seed, `${t.id}@${t.version}#fallback`), 400]];
  for (let attempt = 0; attempt < 440; attempt++) {
    const r = attempt < 40 ? streams[0]![0] : streams[1]![0];
    const d = gen({ rng: r, scope, template: t });
    if (!d) continue;
    const item = finish(ix, t, seed, d, opts.evidence ?? "independent", fingerprint);
    const issues: string[] = [];
    checkItem(item, scope, item.id, (code, _w, message, severity = "error") => {
      if (severity === "error") issues.push(`${code}: ${message}`);
    });
    if (issues.length) {
      if (process.env.GEN_DEBUG) console.error(`[reject] ${t.id}: ${issues[0]}`);
      problems.push(issues[0]!);
      continue;
    }
    try {
      const good = gradeItem(ix, item, canonicalResponse(ix, item, scope), scope);
      const badResponse = wrongResponse(ix, item, scope);
      const bad = badResponse ? gradeItem(ix, item, badResponse, scope) : { correct: false };
      if (!good.correct || bad.correct) {
        problems.push(`self-check failed (canonical ${good.correct}, wrong ${bad.correct})`);
        continue;
      }
    } catch (e) {
      problems.push(`self-check error: ${String(e)}`);
      continue;
    }
    itemContext(ix, item, scope);
    return {
      item,
      meta: {
        templateId: t.id,
        templateVersion: t.version,
        seed,
        grade: t.grade,
        outcomeIds: t.outcomeIds,
        conceptIds: t.conceptIds,
        familyId: t.familyId,
        review: { templateQa: t.qa.status, generated: true, humanReviewed: false },
        accessibleEquivalent: fam.accessibility.screenReaderEquivalent,
      },
    };
  }
  throw new EngineError("generation_failed", `Could not generate a valid ${templateId} item for seed ${seed}: ${problems.slice(0, 3).join(" | ") || "no candidate fitted the scope"}`);
}

export { music };
