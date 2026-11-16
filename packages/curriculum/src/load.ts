import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import {
  AssessmentsFile,
  ConceptsFile,
  CurriculumRelease,
  EngineFile,
  FamiliesFile,
  GradeScopeFile,
  GradeWorld,
  LessonContent,
  ProgressionPolicy,
  ScopeIntroductionsFile,
  ShowcaseFile,
  SourceBookFile,
  StandaloneItemFile,
  SyllabusFile,
  TemplatesFile,
} from "./schema.ts";

export type Issue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  /** File path (relative to the content root) or entity id. */
  where: string;
};

export interface Curriculum {
  root: string;
  release: z.infer<typeof CurriculumRelease>;
  syllabus: z.infer<typeof SyllabusFile>;
  scope: z.infer<typeof GradeScopeFile>;
  scopeIntroductions: z.infer<typeof ScopeIntroductionsFile>;
  engine: z.infer<typeof EngineFile>;
  families: z.infer<typeof FamiliesFile>;
  templates: z.infer<typeof TemplatesFile>[];
  concepts: z.infer<typeof ConceptsFile>[];
  worlds: z.infer<typeof GradeWorld>[];
  assessments: z.infer<typeof AssessmentsFile>[];
  book: z.infer<typeof SourceBookFile>;
  policy: z.infer<typeof ProgressionPolicy>;
  lessons: Array<{ file: string; content: z.infer<typeof LessonContent> }>;
  items: Array<{ file: string; content: z.infer<typeof StandaloneItemFile> }>;
  /** Demonstration sets for the practice lab (Brief 03). */
  showcase: Array<{ file: string; content: z.infer<typeof ShowcaseFile> }>;
}

export const DEFAULT_CONTENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../content");
export const REPO_ROOT = resolve(DEFAULT_CONTENT_ROOT, "..");

/** Logical content paths always use "/" regardless of platform (Windows path.relative returns "\\"). */
export function toPosixPath(p: string): string {
  return p.split(sep).join("/").replace(/\\/g, "/");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Load and schema-validate every content file. Schema failures are returned as issues rather
 * than thrown, so the validator can report all problems at once.
 */
export function loadCurriculum(root: string = DEFAULT_CONTENT_ROOT): { curriculum?: Curriculum; issues: Issue[] } {
  const issues: Issue[] = [];
  const parse = <S extends z.ZodTypeAny>(schema: S, path: string): z.infer<S> | undefined => {
    const where = toPosixPath(relative(root, path) || path);
    if (!existsSync(path)) {
      issues.push({ code: "MISSING_FILE", severity: "error", message: "Required content file is missing", where });
      return undefined;
    }
    let data: unknown;
    try {
      data = readJson(path);
    } catch (e) {
      issues.push({ code: "INVALID_JSON", severity: "error", message: String(e), where });
      return undefined;
    }
    const result = schema.safeParse(data);
    if (!result.success) {
      for (const err of result.error.issues.slice(0, 25)) {
        issues.push({
          code: "SCHEMA",
          severity: "error",
          message: `${err.path.join(".") || "(root)"}: ${err.message}`,
          where,
        });
      }
      return undefined;
    }
    return result.data;
  };

  const many = <S extends z.ZodTypeAny>(schema: S, dir: string): z.infer<S>[] =>
    listJson(join(root, dir))
      .map((p) => parse(schema, p))
      .filter((x): x is z.infer<S> => x !== undefined);

  const release = parse(CurriculumRelease, join(root, "release.json"));
  const syllabus = parse(SyllabusFile, join(root, "syllabus/abrsm-2020-outcomes.json"));
  const scope = parse(GradeScopeFile, join(root, "syllabus/grade-scope.json"));
  const scopeIntroductions = parse(ScopeIntroductionsFile, join(root, "syllabus/scope-concepts.json"));
  const engine = parse(EngineFile, join(root, "engine/engine.json"));
  const families = parse(FamiliesFile, join(root, "exercises/families.json"));
  const book = parse(SourceBookFile, join(root, "source-book/first-steps-sections.json"));
  const policy = parse(ProgressionPolicy, join(root, "policy/progression.json"));
  const templates = many(TemplatesFile, "exercises/templates");
  const concepts = many(ConceptsFile, "concepts");
  const worlds = many(GradeWorld, "path");
  const assessments = many(AssessmentsFile, "assessments");
  const lessons = listJson(join(root, "lessons"))
    .map((p) => ({ file: toPosixPath(relative(root, p)), content: parse(LessonContent, p) }))
    .filter((x): x is { file: string; content: z.infer<typeof LessonContent> } => x.content !== undefined);
  const items = listJson(join(root, "exercises/items"))
    .map((p) => ({ file: toPosixPath(relative(root, p)), content: parse(StandaloneItemFile, p) }))
    .filter((x): x is { file: string; content: z.infer<typeof StandaloneItemFile> } => x.content !== undefined);
  const showcase = listJson(join(root, "exercises/showcase"))
    .map((p) => ({ file: toPosixPath(relative(root, p)), content: parse(ShowcaseFile, p) }))
    .filter((x): x is { file: string; content: z.infer<typeof ShowcaseFile> } => x.content !== undefined)
    .sort((a, b) => a.content.order - b.content.order);

  if (!release || !syllabus || !scope || !scopeIntroductions || !engine || !families || !book || !policy || issues.some((i) => i.severity === "error")) {
    return { issues };
  }
  return {
    curriculum: { root, release, syllabus, scope, scopeIntroductions, engine, families, templates, concepts, worlds, assessments, book, policy, lessons, items, showcase },
    issues,
  };
}
