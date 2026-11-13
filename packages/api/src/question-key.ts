import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExerciseItem } from "@mtp/curriculum";
import { music } from "@mtp/curriculum";

/**
 * A stable identity for *what is being asked*, independent of seed, session and item id. Two generated questions with
 * different seeds that show the same music and expect the same answer share a key, so they cannot both be "fresh
 * first-ever" evidence. Ids and seeds are stripped; everything the learner sees or must answer is kept.
 */
const strip = (v: unknown, alt = false): unknown =>
  Array.isArray(v)
    ? v.map((x) => strip(x, alt))
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v as object)
            .filter(
              (k) =>
                k !== "id" &&
                k !== "seed" &&
                k !== "diagnoses" &&
                k !== "questionAlternative" &&
                !(alt && k === "textAlternative"),
            )
            .sort()
            .map((k) => [k, strip((v as Record<string, unknown>)[k], alt)]),
        )
      : v;

/**
 * The order options are shown in is not part of what is asked: the same question with its options shuffled is the same
 * question, and must not count as fresh evidence. Options (also inside composite parts) are put in a fixed order first.
 */
/** A chord-writing task accepts ANY voicing with the right notes, so its stored worked example is not part of what is asked. */
const withoutWorkedExample = (templateId: string, a: unknown): unknown => {
  if (templateId === "t.g4.chord-build" && a && typeof a === "object") {
    const { acceptedVoicings: _w, ...rest } = a as Record<string, unknown>;
    return rest;
  }
  return a;
};
const normaliseAnswer = (a: unknown): unknown => {
  if (Array.isArray(a)) return a.map(normaliseAnswer);
  if (a && typeof a === "object") {
    const o = Object.fromEntries(
      Object.entries(a as Record<string, unknown>).map(([k, v]) => [
        k,
        normaliseAnswer(v),
      ]),
    );
    if (Array.isArray(o.options))
      o.options = [...(o.options as Array<{ id: string }>)].sort((x, y) =>
        String(x.id).localeCompare(String(y.id)),
      );
    return o;
  }
  return a;
};

/**
 * Templates introduced in Brief 05. Their questions ignore option order. The older templates keep the order-sensitive identity
 * they always had, so exposure and evidence rows stored by earlier briefs still match the same questions after an upgrade.
 * (Misconception `diagnoses` are feedback, not part of what is asked, so they never affect any identity.)
 */
export const ORDER_INSENSITIVE_TEMPLATES = new Set(
  [
    "letter-names",
    "stave-facts",
    "note-place",
    "note-total",
    "note-equivalent",
    "beam-choice",
    "bar-judge",
    "bar-fix",
    "middle-c-find",
    "middle-c-facts",
    "accidental-facts",
    "accidental-read",
    "accidental-write",
    "accidental-count",
    "step-size",
    "scale-gap",
    "key-facts",
    "key-write",
    "degree-note",
    "triad-notes",
    "interval-note",
    "term-sign",
    "melody-detail",
  ].map((x) => `t.g1.${x}`),
);

/** Templates introduced in Brief 06 (Grade 2). New, so they have no stored history; their options are order-insensitive too. */
/** Templates introduced in Brief 07 (Grade 3): new, so no stored history; option order is not part of the question. */
export const GRADE3_ORDER_INSENSITIVE = new Set(
  [
    "compound-facts",
    "compound-judge",
    "compound-rest-judge",
    "triplet-compare",
    "triplet-bar",
    "demisemi-facts",
    "demisemi-judge",
    "ledger-count",
    "octave-sign",
    "octave-pick",
    "minor-forms",
    "scale-gap",
    "key-facts",
    "degree-note",
    "triad-notes",
    "interval-facts",
    "interval-name",
    "term-use",
    "melody-detail",
  ].map((x) => `t.g3.${x}`),
);
export const GRADE2_ORDER_INSENSITIVE = new Set(
  [
    "beat-facts",
    "bar-judge",
    "triplet-facts",
    "triplet-read",
    "triplet-mixed",
    "triplet-fill",
    "rest-judge",
    "rest-fix",
    "time-sig-read",
    "ledger-place",
    "clef-pair",
    "scale-gap",
    "key-facts",
    "minor-pattern",
    "minor-facts",
    "relative-facts",
    "degree-note",
    "triad-notes",
    "interval-note",
    "term-use",
    "melody-detail",
  ].map((x) => `t.g2.${x}`),
);
/** Brief 08 (Grade 4): every Grade 4 template is new, so none has stored history; option order is never part of a question. */
const orderInsensitive = (templateId: string) =>
  templateId.startsWith("t.g4.") ||
  ORDER_INSENSITIVE_TEMPLATES.has(templateId) ||
  GRADE2_ORDER_INSENSITIVE.has(templateId) ||
  GRADE3_ORDER_INSENSITIVE.has(templateId);

export function questionKey(item: ExerciseItem): string {
  const answer = withoutWorkedExample(
    item.templateId,
    orderInsensitive(item.templateId)
      ? normaliseAnswer(item.answer)
      : item.answer,
  );
  // Brief 04 templates keep hashing their text alternative exactly as that release did, so exposure and evidence stored then still match
  // after an upgrade (the learner-facing wording for questions lives in `questionAlternative`, which is never hashed). Templates new in
  // Brief 05 have no history to match, so descriptions never take part in their identity at all.
  const body = JSON.stringify(
    strip(
      {
        t: item.templateId,
        p: item.prompt,
        m: item.music ?? null,
        s: item.score ?? null,
        a: answer,
      },
      orderInsensitive(item.templateId),
    ),
  );
  return createHash("sha256").update(body).digest("hex").slice(0, 24);
}

/**
 * What the learner sees, whatever the template: the same question with its options in a different order is the same question.
 * Used to avoid repeats inside one lesson, practice, review, challenge or assessment (never stored as evidence or exposure,
 * so it cannot disturb the identities earlier briefs recorded).
 */
export function visibleKey(item: ExerciseItem): string {
  // For "complete the bar" the stimulus is the printed time signature and the given notes; the stored accepted answer is only one
  // worked solution, so two different sample solutions of the same bar are the same question.
  const a = withoutWorkedExample(
    item.templateId,
    normaliseAnswer(item.answer),
  ) as Record<string, unknown>;
  const answer =
    a &&
    typeof a === "object" &&
    (a as { kind?: string; task?: string }).kind === "rhythm" &&
    (a as { task?: string }).task === "complete-bar"
      ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== "accepted"))
      : a;
  const body = JSON.stringify(
    strip(
      {
        t: item.templateId,
        p: item.prompt,
        m: item.music ?? null,
        s: item.score ?? null,
        a: answer,
      },
      true,
    ),
  );
  return createHash("sha256").update(body).digest("hex").slice(0, 24);
}

/**
 * A concept-level teaching boundary, narrower than the lesson binding's scope. Every field present must hold.
 *  - `clef`: the question is written in (or asks for) this clef;
 *  - `staffPositions`: every written pitch sits on a line, or in a space, of that clef;
 *  - `includesPitch`: at least one of these spelt pitches (octave included) appears in the question or its answer;
 *  - `ledgerLines`: the most ledger lines any pitch needs in the clef (0 = none).
 */
export interface ReviewConstraint {
  conceptId: string;
  /** Rhythm concepts: the written or answered music must contain one of these values / a rest / a dot / a tie / a beam. */
  rhythm?: {
    values?: string[];
    rest?: boolean;
    dot?: boolean;
    tie?: boolean;
    beam?: boolean;
  };
  /** Alternative to the pitch fields: a question whose prompt names one of these words is about the concept (for example "middle C"). */
  promptMentions?: string[];
  /** The music shows one of these written accidental signs ("sharp", "flat", "natural"). */
  showsSign?: string[];
  /** Key concepts: the question is about one of these keys. */
  keys?: string[];
  /** Vocabulary concepts: the term asked about (or its meaning) is in one of these categories. */
  termCategories?: string[];
  /** Brief 06: the question is about one of these time signatures (printed, answered, or named in the prompt). */
  timeSignatures?: string[];
  /** Brief 06: the prompt contains at least one of these phrases (the wording tells the kinds of question apart). */
  promptIncludes?: string[];
  /** Brief 06: the prompt contains none of these phrases (for example wording a later lesson teaches). */
  promptExcludes?: string[];
  /** Brief 06: the term asked about is one of these term ids. */
  termIds?: string[];
  clef?: "treble" | "bass" | "alto" | "tenor";
  staffPositions?: "lines" | "spaces";
  includesPitch?: string[];
  ledgerLines?: number;
  /** At least one written pitch needs this many ledger lines or more (the concept is about reading beyond the stave). */
  minLedgerLines?: number;
  /** Brief 07: the interval the question is about has one of these qualities ("M" major, "m" minor, "P" perfect), read from its accepted answer. */
  intervalQualities?: string[];
  /** Brief 08 review: the interval's lower note is not the key's tonic (intervals above the tonic belong to an earlier grade). */
  intervalLowerNotTonic?: boolean;
  /** Brief 08 review: the chord asked about (read from the answer) is one of these Roman numerals. */
  romans?: string[];
  /** Brief 08 review: the key (or answered signature) has at least one sharp or flat. */
  nonEmptySignature?: boolean;
  /** Brief 08 review: a double sharp or flat is printed in the music, or is the pitch answered (or, with no music, the prompt is about one). */
  doubleSign?: boolean;
}

const PITCH = /^[A-G](bb|b|#|x)?-?\d$/;
function collectPitches(v: unknown, out: string[]) {
  if (typeof v === "string") {
    if (PITCH.test(v)) out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => collectPitches(x, out));
  else if (v && typeof v === "object")
    Object.values(v as object).forEach((x) => collectPitches(x, out));
}

/** The clef a question is written in or asks for (stave items only). */
function clefOf(item: ExerciseItem): string | undefined {
  return item.music?.clef ?? (item.answer as { clef?: string }).clef;
}

function rhythmEvents(item: ExerciseItem): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (
        (o.kind === "note" || o.kind === "rest" || o.kind === "chord") &&
        o.duration
      )
        out.push(o);
      Object.values(o).forEach(walk);
    }
  };
  walk(item.music ?? null);
  walk((item.answer as { accepted?: unknown }).accepted);
  walk((item.answer as { given?: unknown }).given);
  return out;
}

/** The key a question is about: its printed key, a stated key, a scale's start note, or a named key answer. */
function keyOf(item: ExerciseItem): string | undefined {
  const a = item.answer as {
    key?: string;
    accepted?: unknown[];
    derivation?: {
      rule?: string;
      key?: string;
      start?: string;
      sourceKey?: string;
    };
    keyName?: string;
  };
  if (a.keyName) return a.keyName;
  if (item.music?.key) return item.music.key;
  if (a.key) return a.key;
  if (a.derivation?.rule === "scale" && a.derivation.key)
    return a.derivation.key;
  if (a.derivation?.rule === "scale" && a.derivation.start)
    return `${a.derivation.start.replace(/\d+$/, "")} major`;
  if (
    typeof a.accepted?.[0] === "string" &&
    /(major|minor)$/.test(a.accepted[0] as string)
  )
    return a.accepted[0] as string;
  // Grade 2 templates (Brief 06): a choice whose right answer is a key names the key it is about. Not applied to older templates,
  // so what earlier briefs credited is unchanged.
  const right = (item.answer as { correctOptionIds?: string[] })
    .correctOptionIds?.[0];
  if (
    /^t\.g[23]\./.test(item.templateId) &&
    right &&
    /^[A-G][b#]? (major|minor)$/.test(right)
  )
    return right;
  const text = item.prompt.replace(/♯/g, "#").replace(/♭/g, "b");
  const harmonic = /\b([A-G][b#]?) (?:harmonic|melodic) minor\b/.exec(text);
  if (harmonic) return `${harmonic[1]} minor`;
  const m = /\b([A-G][b#]?) (major|minor)\b/.exec(text);
  return m ? `${m[1]} ${m[2]}` : undefined;
}

/** The time signatures a question is about: printed on its music, the answer (all that are accepted), the correct option, or named in the prompt. */
function timeSignaturesOf(item: ExerciseItem): string[] {
  const a = item.answer as {
    timeSignature?: string;
    accepted?: unknown[];
    correctOptionIds?: string[];
  };
  const TS = /^\d{1,2}\/\d{1,2}$/;
  if (item.music?.timeSignature) return [item.music.timeSignature];
  if (a.timeSignature) return [a.timeSignature];
  const accepted = (a.accepted ?? []).filter(
    (x): x is string => typeof x === "string" && TS.test(x),
  );
  if (accepted.length) return accepted;
  if (a.correctOptionIds?.[0] && TS.test(a.correctOptionIds[0]))
    return [a.correctOptionIds[0]];
  const m = /\b(\d{1,2}\/\d{1,2})\b/.exec(item.prompt)?.[1];
  return m ? [m] : [];
}

/** True when the question satisfies every part of the constraint (pitch fields need written pitches to judge). */
export function satisfies(item: ExerciseItem, c: ReviewConstraint): boolean {
  if (c.promptMentions?.some((w) => item.prompt.includes(w))) return true;
  if (
    c.promptIncludes &&
    !c.promptIncludes.some((w) => item.prompt.includes(w))
  )
    return false;
  if (c.promptExcludes?.some((w) => item.prompt.includes(w))) return false;
  if (c.timeSignatures) {
    if (!timeSignaturesOf(item).some((t) => c.timeSignatures!.includes(t)))
      return false;
  }
  if (c.intervalQualities) {
    const a = item.answer as {
      acceptedIntervals?: string[];
      target?: string;
      correctOptionIds?: string[];
    };
    const q = a.acceptedIntervals?.[0] ?? a.target ?? a.correctOptionIds?.[0];
    const word: Record<string, string> = {
      major: "M",
      minor: "m",
      perfect: "P",
    };
    const ch =
      typeof q === "string"
        ? (word[q] ?? (/^[PMmdA]\d/.test(q) ? q[0] : undefined))
        : undefined;
    if (!ch || !c.intervalQualities.includes(ch)) return false;
  }
  if (c.intervalLowerNotTonic) {
    const a = item.answer as {
      kind?: string;
      key?: string;
      lower?: string;
      direction?: string;
      acceptedPitches?: string[];
    };
    // questions about how interval qualities behave (no two written notes) have no lower note to judge
    if (a.kind === "interval") {
      if (!a.key) return false;
      const lower =
        a.lower && a.direction !== "down"
          ? a.lower
          : a.direction === "down"
            ? a.acceptedPitches?.[0]
            : a.lower;
      const tonic = /^([A-G][b#]?)/.exec(a.key)?.[1];
      const lowerName =
        typeof lower === "string"
          ? lower.replace(/-?\d+$/, "").replace(/x/g, "##")
          : undefined;
      if (!lowerName || !tonic || lowerName === tonic) return false;
    }
  }
  if (c.romans) {
    const found: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
          if ((k === "roman" || k === "target") && typeof x === "string")
            found.push(x);
          else walk(x);
        }
      }
    };
    walk(item.answer);
    const right = (item.answer as { correctOptionIds?: string[] })
      .correctOptionIds?.[0];
    if (right) found.push(right);
    // no chord named in the answer (for example "which notes make chord IV?"): the chord the prompt names
    if (!found.some((r) => /^[IV]+$/.test(r))) for (const m of item.prompt.matchAll(/\bchord (VII|VI|IV|V|III|II|I)\b/g)) found.push(m[1]!);
    if (!found.some((r) => c.romans!.includes(r))) return false;
  }
  if (c.nonEmptySignature) {
    const a = item.answer as { kind?: string; accidentals?: unknown[] };
    if (a.kind === "key-signature" && Array.isArray(a.accidentals)) {
      if (!a.accidentals.length) return false;
    } else {
      const k = keyOf(item);
      if (!k || k === "C major" || k === "A minor") return false;
    }
  }
  if (c.doubleSign) {
    const signs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.writtenAccidental === "string")
          signs.push(o.writtenAccidental);
        Object.values(o).forEach(walk);
      }
    };
    walk(item.music ?? null);
    const printed = signs.some(
      (x) => x === "double-sharp" || x === "double-flat",
    );
    const answered: string[] = [];
    collectPitches(item.answer, answered);
    const answeredDouble = answered.some((x) => /^[A-G](bb|x)/.test(x));
    const bare = !item.music && /double|𝄪|𝄫/i.test(item.prompt);
    if (!printed && !answeredDouble && !bare) return false;
  }
  if (c.termIds) {
    const t = (item.answer as { correctOptionIds?: string[] })
      .correctOptionIds?.[0];
    if (!t || !c.termIds.includes(t)) return false;
  }
  if (c.rhythm) {
    const evs = rhythmEvents(item);
    const r = c.rhythm;
    if (
      r.values &&
      !evs.some((e) =>
        r.values!.includes((e.duration as { value: string }).value),
      )
    )
      return false;
    if (
      r.rest &&
      !evs.some((e) => e.kind === "rest") &&
      !/ rest"/.test(
        JSON.stringify((item.answer as { options?: unknown }).options ?? ""),
      )
    )
      return false;
    if (
      r.dot &&
      !evs.some((e) => ((e.duration as { dots?: number }).dots ?? 0) > 0)
    )
      return false;
    if (r.tie && !evs.some((e) => e.tieToNext === true)) return false;
    if (
      r.beam &&
      !evs.some((e) => typeof e.beam === "string" && e.beam !== "none")
    )
      return false;
  }
  if (c.showsSign) {
    const signs: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.writtenAccidental === "string")
          signs.push(o.writtenAccidental);
        Object.values(o).forEach(walk);
      }
    };
    walk(item.music ?? null);
    if (!signs.some((x) => c.showsSign!.includes(x))) return false;
  }
  if (c.keys) {
    const k = keyOf(item);
    if (!k || !c.keys.includes(k)) return false;
  }
  if (c.termCategories) {
    const t = (item.answer as { kind?: string; correctOptionIds?: string[] })
      .correctOptionIds?.[0];
    const term = music.TERMS.find((x) => x.id === t);
    if (!term || !c.termCategories.includes(term.category)) return false;
  }
  const needsPitch = Boolean(
    c.clef ||
    c.staffPositions ||
    c.includesPitch ||
    c.ledgerLines !== undefined ||
    c.minLedgerLines !== undefined,
  );
  if (!needsPitch) return true;
  const pitches: string[] = [];
  collectPitches(item.music ?? null, pitches);
  collectPitches(item.answer, pitches);
  if (!pitches.length) return false;
  if (c.clef && clefOf(item) !== c.clef) return false;
  if (c.includesPitch && !pitches.some((p) => c.includesPitch!.includes(p)))
    return false;
  if (c.staffPositions) {
    const clef = (c.clef ?? clefOf(item)) as ReviewConstraint["clef"];
    if (!clef) return false;
    const ok = pitches.every((p) => {
      const pos = music.staffPosition(clef, music.parsePitch(p));
      return c.staffPositions === "lines" ? pos % 2 === 0 : pos % 2 !== 0;
    });
    if (!ok) return false;
  }
  if (c.minLedgerLines !== undefined) {
    const clef = (c.clef ?? clefOf(item)) as ReviewConstraint["clef"];
    if (!clef) return false;
    if (
      !pitches.some(
        (p) =>
          music.ledgerLines(clef, music.parsePitch(p)) >= c.minLedgerLines!,
      )
    )
      return false;
  }
  if (c.ledgerLines !== undefined) {
    const clef = (c.clef ?? clefOf(item)) as ReviewConstraint["clef"];
    if (!clef) return false;
    if (
      !pitches.every(
        (p) => music.ledgerLines(clef, music.parsePitch(p)) <= c.ledgerLines!,
      )
    )
      return false;
  }
  return true;
}

/** Read content/policy/review-constraints.json (absent file: no extra constraints). */
export function loadConstraints(
  root: string,
  concepts: Map<string, unknown>,
): Map<string, ReviewConstraint> {
  const out = new Map<string, ReviewConstraint>();
  try {
    const file = JSON.parse(
      readFileSync(join(root, "policy/review-constraints.json"), "utf8"),
    ) as { constraints: ReviewConstraint[] };
    for (const c of file.constraints) {
      if (!concepts.has(c.conceptId))
        throw new Error(`review-constraints: unknown concept ${c.conceptId}`);
      out.set(c.conceptId, c);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return out;
}
