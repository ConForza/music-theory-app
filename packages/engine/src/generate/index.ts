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
import { rng as makeRng, type Rng } from "../rng.ts";
import { canonicalResponse, wrongResponse } from "./canonical.ts";
import { GENERATORS, type Draft } from "./families.ts";

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

export const generatorTemplateIds = (ix: CurriculumIndex): string[] => [...ix.templates.values()].filter((t) => GENERATORS[t.familyId]?.(t) !== undefined).map((t) => t.id);

export function generatedItemId(templateId: string, version: number, seed: number): string {
  return `i.gen.${templateId.slice(2).replace(/\./g, "-")}.v${version}.s${seed}`;
}

/** Parse a generated item id back into its template, version and seed (for server-side regeneration). */
export function parseGeneratedItemId(id: string): { templateId: string; version: number; seed: number } | null {
  const m = /^i\.gen\.(g[1-5])-([a-z0-9-]+)\.v(\d+)\.s(\d+)$/.exec(id);
  if (!m) return null;
  return { templateId: `t.${m[1]}.${m[2]}`, version: Number(m[3]), seed: Number(m[4]) };
}

function finish(ix: CurriculumIndex, t: ExerciseTemplate, seed: number, d: Draft, evidence: "learning" | "independent"): ExerciseItem {
  const fam = ix.families.get(t.familyId)!;
  const mistakes = Object.fromEntries([...fam.mistakeCategories, ...t.extraMistakeCategories].map((m) => [m.id, m.feedback]));
  return {
    id: generatedItemId(t.id, t.version, seed),
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
}

export function generateItem(ix: CurriculumIndex, templateId: string, seed: number, opts: GenerateOptions = {}): GeneratedItem {
  const t = ix.templates.get(templateId);
  if (!t) throw new EngineError("unknown_template", `Unknown template ${templateId}`);
  if (opts.version !== undefined && opts.version !== t.version) throw new EngineError("unknown_template", `Template ${templateId} is now version ${t.version}`);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2 ** 31 - 1) throw new EngineError("unsupported", "Seed must be a non-negative 31-bit integer");
  const gen = GENERATORS[t.familyId]?.(t);
  if (!gen) throw new EngineError("unsupported", `No generator for ${templateId}`);
  const scope = opts.scope ?? templateScope(ix, t);
  const r: Rng = makeRng(seed, `${t.id}@${t.version}`);
  const fam = ix.families.get(t.familyId)!;
  const problems: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const d = gen({ rng: r, scope, template: t });
    if (!d) continue;
    const item = finish(ix, t, seed, d, opts.evidence ?? "independent");
    const issues: string[] = [];
    checkItem(item, scope, item.id, (code, _w, message, severity = "error") => {
      if (severity === "error") issues.push(`${code}: ${message}`);
    });
    if (issues.length) {
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
  throw new EngineError("unsupported", `Could not generate a valid ${templateId} item for seed ${seed}: ${problems.slice(0, 3).join(" | ")}`);
}

export { music };
