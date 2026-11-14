/**
 * Generators for the terminology completion templates (`t.gN.book-terms`, `t.gN.book-use`, N = 2, 3, 4).
 *
 * Every question is a single-answer choice whose correct option id is the vocabulary id of the term being asked, so the concept boundary
 * `termIds` (content/policy/review-constraints.json) credits it to exactly the lesson that teaches that term.
 *
 * Teaching order is enforced here, not only on the path. A question's target is a term of THIS grade's new lessons; every other word it
 * shows (a wrong option) comes from the older vocabulary of the grade or earlier, or from a book lesson at or before the target's lesson.
 * The lessons form one unbroken chain, so a learner who has been served a question about a term has completed that term's lesson and every
 * lesson before it: no question ever shows a word the learner has not yet been taught.
 *
 * Wrong options never share a group or a meaning with the target, and never come from a class of words that could also fit the description
 * (speed words never sit beside speed words, mood words only beside moods of another pole, and so on; see `ALLOWED`).
 */
import { music } from "@mtp/curriculum";
import { frag, melodyIn, note, type Gen } from "./families.ts";
import { keysIn } from "./grade1.ts";
import { clefsOf, diag, posText } from "./grade2.ts";

type Ctx = Parameters<Gen>[0];
type BookClass = music.BookClass;
type Pole = music.BookPole;

interface T {
  id: string;
  term: string;
  meaning: string;
  cls: BookClass;
  pole: Pole;
  group: string;
  category: string;
  /** Position of its lesson in BOOK_LESSONS; -1 for terms the course already taught before this work. */
  at: number;
  character?: string;
  phrases?: Array<{ phrase: string; meaning: string }>;
  mark?: music.TermBook["mark"];
  similar: string[];
  opposite: string[];
}

const classOf = (category: string): BookClass =>
  category === "tempo" || category === "change-of-speed" ? "speed" : category === "dynamics" ? "volume" : category === "articulation" ? "touch" : category === "sign" ? "mark" : category === "structure" ? "structure" : "mood";

/** Mood of the older expression words, for the pole rule (a word not listed is neutral and is never offered as a wrong option beside a mood). */
const OLD_POLE: Record<string, Pole> = { dolce: "gentle", cantabile: "gentle", grazioso: "gentle", maestoso: "strong", "con-moto": "lively" };

/** The classes a wrong option may come from, by the class of the target. Same-class options are excluded because their meanings could also fit. */
const ALLOWED: Record<BookClass, BookClass[]> = {
  speed: ["volume", "touch", "structure", "mark"],
  volume: ["speed", "touch", "structure", "word", "mark"],
  touch: ["speed", "structure", "word", "mark"],
  structure: ["speed", "volume", "touch", "mood", "word", "mark"],
  mood: ["structure", "word", "mark", "mood"],
  word: ["speed", "volume", "touch", "structure", "mood", "word", "mark"],
  mark: ["speed", "structure", "word", "mood"],
};

const lessonIndex = (id: string) => music.BOOK_LESSONS.findIndex((l) => l.termIds.includes(id));

const REGISTRY = (() => {
  const book = new Map<string, T>();
  for (const x of music.TERMS_BOOK) {
    book.set(x.id, { id: x.id, term: x.term, meaning: x.meaning, cls: x.cls, pole: x.pole ?? "neutral", group: x.group, category: x.category, at: lessonIndex(x.id), ...(x.character ? { character: x.character } : {}), ...(x.phrases ? { phrases: x.phrases } : {}), ...(x.mark ? { mark: x.mark } : {}), similar: [], opposite: [] });
  }
  // staccatissimo already existed (taught nowhere); it is taught by the Grade 2 touch-signs lesson of this work.
  const sta = music.TERMS.find((x) => x.id === "staccatissimo")!;
  book.set("staccatissimo", { id: sta.id, term: "staccatissimo (the wedge sign)", meaning: sta.meaning, cls: "touch", pole: "neutral", group: "very-short", category: sta.category, at: lessonIndex("staccatissimo"), mark: "staccatissimo", character: "a note that must be as short and detached as possible", similar: ["staccato"], opposite: [] });
  const old = new Map<string, T>();
  for (const x of [...music.TERMS, ...music.TERMS_G4]) {
    if (book.has(x.id)) continue;
    const o = x as music.Term;
    old.set(x.id, { id: x.id, term: x.term, meaning: x.meaning, cls: classOf(x.category), pole: OLD_POLE[x.id] ?? "neutral", group: `old:${x.id}`, category: x.category, at: -1, similar: o.similar ?? [], opposite: o.opposite ?? [], ...("firstGrade" in x ? { firstGrade: (x as music.Term).firstGrade } : { firstGrade: 4 }) } as T);
  }
  return { book, old };
})();
const oldFirstGrade = (t: T) => (t as T & { firstGrade?: number }).firstGrade ?? 1;

const gradeOf = (c: Ctx) => c.template.grade;
const targetsFor = (grade: number): T[] => music.bookTermsOfGrade(grade).map((id) => REGISTRY.book.get(id)!).filter((t) => t.id !== "staccatissimo" || grade === 2);

/** Every term a learner can have met when asked about `target`. */
function pool(grade: number, target: T): T[] {
  const out: T[] = [];
  for (const o of REGISTRY.old.values()) if (oldFirstGrade(o) <= grade) out.push(o);
  for (const b of REGISTRY.book.values()) if (b.at >= 0 && b.at <= target.at) out.push(b);
  return out;
}

/** Words that could also fit the meaning of a term in another class (a strong accent and sforzando, force and forte ...). */
const ALSO_FITS: Record<string, string[]> = {
  "pointed-accent": ["accent", "sforzando", "marcato", "forza"],
  marcato: ["accent", "pointed-accent", "sforzando", "forza", "tenuto"],
  forza: ["forte", "fortissimo", "sforzando", "accent", "marcato", "pointed-accent"],
  staccatissimo: ["staccato", "semi-staccato"],
  "semi-staccato": ["staccato", "staccatissimo", "legato", "tenuto"],
  tranquillo: ["piano", "pianissimo", "dolce"],
  delicato: ["piano", "pianissimo", "dolce"],
  stringendo: ["accelerando", "affrettando", "incalzando"],
  allargando: ["rallentando", "ritardando", "ritenuto", "calando", "morendo"],
  "alla-breve": ["a-tempo"],
  rubato: ["a-tempo"],
};
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[“”()∧∨>.,:]/g, " ").split(/\s+/).filter(Boolean));
/** A wrong option may not contain a word of the target or of its phrases (old "sotto voce" beside "voce", "a tempo" beside "a"). */
const shareWord = (target: T, d: T): boolean => {
  const mine = new Set([...tokens(target.term), ...(target.phrases ?? []).flatMap((p) => [...tokens(p.phrase)])]);
  const stop = new Set(["the", "sign", "over", "under", "note", "or", "of", "in", "to", "on"]);
  return [...tokens(d.term)].some((w) => mine.has(w) && !stop.has(w));
};

const confusable = (target: T, d: T): boolean => {
  if (d.id === target.id || d.group === target.group || d.meaning === target.meaning) return true;
  if (target.similar.includes(d.id) || d.similar.includes(target.id)) return true;
  if ((ALSO_FITS[target.id] ?? []).includes(d.id) || (ALSO_FITS[d.id] ?? []).includes(target.id)) return true;
  if (shareWord(target, d)) return true;
  if (!ALLOWED[target.cls].includes(d.cls)) return true;
  if (target.cls === "mood" && d.cls === "mood") return target.pole === d.pole || target.pole === "neutral" || d.pole === "neutral";
  if (target.cls === "word" && d.cls === "word") return false;
  return false;
};

function distractors(c: Ctx, target: T, grade: number, need = 3, filter: (d: T) => boolean = () => true): T[] | null {
  const ok = pool(grade, target).filter((d) => !confusable(target, d) && filter(d) && (target.cls === "word" || d.cls !== "word"));
  const picks: T[] = [];
  // little words are best tested against other little words, so the choice is about the meaning and not about the kind of word
  if (target.cls === "word") {
    for (const d of c.rng.shuffle(ok.filter((x) => x.cls === "word"))) {
      if (picks.length === Math.min(2, need)) break;
      if (!picks.some((p) => p.meaning === d.meaning || p.group === d.group)) picks.push(d);
    }
  }
  // prefer a spread of classes so the wrong options are not all alike
  for (const d of c.rng.shuffle(ok)) {
    if (picks.length === need) break;
    if (picks.some((p) => p.id === d.id || p.meaning === d.meaning || p.group === d.group)) continue;
    if (picks.some((p) => p.cls === d.cls && p.cls !== "word" && p.cls !== "mood") && ok.filter((x) => !picks.some((p) => p.cls === x.cls)).length >= need - picks.length) continue;
    picks.push(d);
  }
  return picks.length === need ? picks : null;
}

const why = (target: T, d: T, side: "meaning" | "term") =>
  diag(target.opposite.includes(d.id) ? "opposite-meaning" : d.category === target.category ? "confused-similar-term" : "wrong-category", side === "meaning" ? `That is what “${d.term}” means, not “${target.term}”.` : `“${d.term}” means ${d.meaning}; the word asked about means ${target.meaning}.`);
const diagnoses = (target: T, picks: T[], side: "meaning" | "term") => Object.fromEntries(picks.map((p) => [p.id, why(target, p, side)]));
const opts = (c: Ctx, target: T, picks: T[], label: (t: T) => string) => c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: label(t) }));
/** A cue that names the kind of word without giving the answer away. */
const cue = (t: T): string =>
  t.cls === "speed" ? "It is about speed or time: faster, slower or in between." : t.cls === "touch" ? "It is about how a note is touched: how short, how stressed or how held." : t.cls === "structure" ? "It tells the player where in the music, or in what order, to play." : t.cls === "mood" ? "It describes a feeling or a style of playing, not a speed." : "It is a small word that joins with others to make a direction.";

// ---------------------------------------------------------------------------
// t.gN.book-terms: meet the term in words
// ---------------------------------------------------------------------------

/** What does the term or phrase mean? Which term means this? What does this short direction mean? */
export const bookTerms: Gen = (c) => {
  const grade = gradeOf(c);
  const target = c.rng.pick(targetsFor(grade));
  const modes = ["to-meaning", "to-term", ...(target.phrases?.length ? (["phrase"] as const) : [])] as const;
  const mode = c.rng.pick([...modes]);
  const picks = distractors(c, target, grade);
  if (!picks) return null;
  const hint = cue(target);
  if (mode === "to-meaning") {
    return { prompt: `What does “${target.term}” mean?`, answer: { kind: "choice", options: opts(c, target, picks, (t) => t.meaning), correctOptionIds: [target.id], diagnoses: diagnoses(target, picks, "meaning") }, hints: [hint] };
  }
  if (mode === "to-term") {
    return { prompt: `Which ${target.cls === "touch" || target.cls === "mark" ? "sign" : "word"} means “${target.meaning}”?`, answer: { kind: "choice", options: opts(c, target, picks, (t) => t.term), correctOptionIds: [target.id], diagnoses: diagnoses(target, picks, "term") }, hints: [hint] };
  }
  const ph = c.rng.pick(target.phrases!);
  // Wrong options: the gloss of a phrase or word from another term, never one that repeats the right gloss.
  const labelOf = (t: T) => (t.id === target.id ? ph.meaning : t.phrases?.length ? c.rng.pick(t.phrases).meaning : t.meaning);
  const labelled = c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: labelOf(t) }));
  if (new Set(labelled.map((x) => x.label.toLowerCase())).size < labelled.length) return null;
  return { prompt: `What does the direction “${ph.phrase}” mean?`, answer: { kind: "choice", options: labelled, correctOptionIds: [target.id], diagnoses: diagnoses(target, picks, "meaning") }, hints: ["Take the direction one word at a time, using what the lessons taught about each word."] };
};

// ---------------------------------------------------------------------------
// t.gN.book-use: use the term (a description, a marked melody, a sign on notes)
// ---------------------------------------------------------------------------

const simpleQuarterTs = (c: Ctx) => (c.scope.timeSignatures ?? []).filter((t) => music.classifyTimeSignature(t).metre === "simple" && music.parseTimeSignature(t).bottom === 4 && music.parseTimeSignature(t).top <= 4);

/** A one- or two-bar melody of crotchets, optionally carrying a tempo text and articulation or slur marks on chosen notes. */
function tune(c: Ctx, opts: { tempo?: string; marks?: Record<number, { art?: string; slur?: "start" | "stop" }>; bars?: number; note?: string; minBeats?: number } = {}) {
  const tsPool = simpleQuarterTs(c).filter((t) => music.parseTimeSignature(t).top >= (opts.minBeats ?? 2));
  const keys = keysIn(c).filter((k) => k.endsWith("major"));
  if (!tsPool.length || !keys.length || !valueIn(c, "crotchet")) return null;
  const ts = c.rng.pick(tsPool);
  const top = music.parseTimeSignature(ts).top;
  const bars = opts.bars ?? 2;
  const keyText = c.rng.pick(keys);
  const key = music.parseKey(keyText);
  const clef = c.rng.pick(clefsOf(c)) as music.Clef;
  const pitches = melodyIn(c, key, clef, top * bars);
  if (!pitches) return null;
  let k = 0;
  const measures = Array.from({ length: bars }, (_, b) => ({
    events: Array.from({ length: top }, () => {
      const i = k++;
      const m = opts.marks?.[i];
      return note(pitches[i]!, "crotchet", { ...(m?.art ? { articulations: [m.art] } : {}), ...(m?.slur ? { slur: m.slur } : {}) });
    }),
    ...(b === bars - 1 ? { barline: "final" as const } : {}),
  }));
  const sig = music.keySignature(key);
  const sigWord = sig.count === 0 ? "no sharps or flats" : `${sig.count} ${sig.count === 1 ? (sig.type === "sharps" ? "sharp" : "flat") : sig.type}`;
  const text = `A ${bars}-bar melody in the ${clef} clef, key signature of ${sigWord}, time signature ${ts}. ${measures.map((m, i) => `Bar ${i + 1}: ${m.events.map((e) => `crotchet ${posText(music.staffPosition(clef, music.parsePitch((e as { pitch: string }).pitch)))}`).join("; ")}.`).join(" ")}${opts.tempo ? ` The tempo mark above the first bar says “${opts.tempo}”.` : ""}${opts.note ? ` ${opts.note}` : ""}`;
  return { fragment: frag(clef, measures, text, { key: keyText, timeSignature: ts, showKeySignature: true, ...(opts.tempo ? { tempoText: opts.tempo } : {}) }), keyText, clef };
}
const valueIn = (c: Ctx, v: string) => !c.scope.noteValues?.length || c.scope.noteValues.includes(v as never);

/** How each sign is drawn on a four-note bar, and how it is described in words for a reader who cannot see it. */
const SIGN_DRAW: Record<string, { marks: Record<number, { art?: string; slur?: "start" | "stop" }>; text: string }> = {
  staccato: { marks: { 1: { art: "staccato" } }, text: "The second note has a small dot above or below its head." },
  accent: { marks: { 1: { art: "accent" } }, text: "The second note has a sideways V (>) above or below it." },
  tenuto: { marks: { 1: { art: "tenuto" } }, text: "The second note has a short horizontal line above or below its head." },
  staccatissimo: { marks: { 1: { art: "staccatissimo" } }, text: "The second note has a small pointed wedge above or below its head." },
  "pointed-accent": { marks: { 1: { art: "strong-accent" } }, text: "The second note has a pointed arrowhead (an upside-down V, ∧) above it, or a V (∨) below it." },
  "semi-staccato": { marks: { 0: { art: "staccato", slur: "start" }, 1: { art: "staccato" }, 2: { art: "staccato", slur: "stop" } }, text: "The first three notes sit under one curved slur line and each has a dot." },
};

/** Use the term: pick it for a description, read a marked melody, or name a sign drawn on notes. */
export const bookUse: Gen = (c) => {
  const grade = gradeOf(c);
  const target = c.rng.pick(targetsFor(grade));
  const modes: Array<"character" | "in-tune" | "sign"> = [];
  if (target.mark) modes.push("sign", "character");
  else if (target.character) modes.push("character", ...(target.cls === "speed" || target.cls === "mood" ? (["in-tune"] as const) : []));
  if (!modes.length) {
    // little words and order words have no description or sign: use them inside a direction they belong to
    return phraseUse(c, target, grade);
  }
  const mode = c.rng.pick(modes);
  if (mode === "character") {
    const picks = distractors(c, target, grade, 3, (d) => d.cls !== "word" || target.cls === "word");
    if (!picks) return null;
    return { prompt: `A composer wants ${target.character}. Which marking fits best?`, answer: { kind: "choice", options: opts(c, target, picks, (t) => t.term), correctOptionIds: [target.id], diagnoses: diagnoses(target, picks, "term") }, hints: [cue(target)] };
  }
  if (mode === "in-tune") {
    const picks = distractors(c, target, grade);
    const m = picks && tune(c, { tempo: target.term.split(",")[0]!.replace(/\s*\(.*\)/, "") });
    if (!picks || !m) return null;
    return { prompt: `This melody is marked “${target.term.split(",")[0]!.replace(/\s*\(.*\)/, "")}”. What does the marking ask the player to do?`, music: m.fragment, answer: { kind: "choice", options: opts(c, target, picks, (t) => t.meaning), correctOptionIds: [target.id], diagnoses: diagnoses(target, picks, "meaning") }, hints: [cue(target)] };
  }
  // sign: the five signs of touch the learner has met by the Grade 2 touch-signs lesson, drawn on a short melody
  const SIGNS = ["staccato", "accent", "tenuto", "staccatissimo", "pointed-accent", "semi-staccato"];
  const draw = SIGN_DRAW[target.id];
  if (!draw) return null;
  const known = (id: string) => id === target.id || id === "staccato" || id === "accent" || id === "tenuto" || (REGISTRY.book.get(id)?.at ?? 99) <= target.at;
  const others = c.rng.shuffle(SIGNS.filter((s) => s !== target.id && known(s)));
  const picks = others.slice(0, 3).map((id) => REGISTRY.book.get(id) ?? oldSign(id));
  if (picks.length < 3) return null;
  const m = tune(c, { marks: draw.marks, bars: 1, note: draw.text, minBeats: Math.max(...Object.keys(draw.marks).map(Number)) + 1 });
  if (!m) return null;
  const where = target.id === "semi-staccato" ? "the first three notes" : "the second note";
  return {
    prompt: `Look at the marks on ${where}. Which sign is it?`,
    music: m.fragment,
    answer: { kind: "choice", options: c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: signName(t) })), correctOptionIds: [target.id], diagnoses: Object.fromEntries(picks.map((p) => [p.id, diag("confused-similar-term", `That sign is “${signName(p)}”: ${p.meaning}.`)])) },
    hints: [`Look closely at the shapes: ${draw.text.replace(/^The /, "the ")} Compare it with each sign in the lesson.`],
  };
};

const SIGN_NAMES: Record<string, string> = { staccato: "staccato dot", accent: "accent (>)", tenuto: "tenuto line", staccatissimo: "wedge (staccatissimo)", "pointed-accent": "pointed accent (∧ or ∨)", "semi-staccato": "dots under a slur (semi-staccato)" };
const signName = (t: T) => SIGN_NAMES[t.id] ?? t.term;
function oldSign(id: string): T {
  const o = REGISTRY.old.get(id) ?? REGISTRY.book.get(id);
  if (!o) throw new Error(`unknown sign ${id}`);
  return o;
}

/** Little words, order words and the like: ask for the gloss of a short direction that uses them. */
function phraseUse(c: Ctx, target: T, grade: number) {
  const ph = target.phrases?.length ? c.rng.pick(target.phrases) : null;
  const picks = distractors(c, target, grade);
  if (!ph || !picks) return null;
  const labelled = c.rng.shuffle([target, ...picks]).map((t) => ({ id: t.id, label: t.id === target.id ? ph.meaning : t.phrases?.length ? c.rng.pick(t.phrases).meaning : t.meaning }));
  if (new Set(labelled.map((x) => x.label.toLowerCase())).size < labelled.length) return null;
  const m = tune(c, { tempo: ph.phrase });
  return {
    prompt: m ? `This melody is marked “${ph.phrase}”. What does the marking ask the player to do?` : `A score says “${ph.phrase}”. What does it ask the player to do?`,
    ...(m ? { music: m.fragment } : {}),
    answer: { kind: "choice" as const, options: labelled, correctOptionIds: [target.id], diagnoses: diagnoses(target, picks, "meaning") },
    hints: ["Read the direction one word at a time, using what the lessons taught about each word."],
  };
}

export const BOOK_GENERATORS: Record<string, Gen> = {
  "t.g2.book-terms": bookTerms,
  "t.g3.book-terms": bookTerms,
  "t.g4.book-terms": bookTerms,
  "t.g2.book-use": bookUse,
  "t.g3.book-use": bookUse,
  "t.g4.book-use": bookUse,
};
