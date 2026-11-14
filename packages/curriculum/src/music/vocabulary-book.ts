/**
 * Terminology completion vocabulary (VOCAB_BOOK, version 1): the Grade 2, 3 and 4 terms and signs that the reference book lists
 * and that `TERMS` / `TERMS_G4` / `TERMS_G5` do not hold (see content/source-book/terminology-inventory.json and
 * docs/curriculum/TERMINOLOGY_COVERAGE.md for the entry-by-entry comparison).
 *
 * VERSIONED AND KEPT SEPARATE, exactly as the Grade 4 and Grade 5 lists: `TERMS`, `TERMS_G4` and `VOCAB_G5` are part of the generation
 * fingerprint of the templates that existed before this work, so none of them is edited. `VOCAB_BOOK` joins the fingerprint of the new
 * `*.book-*` templates only (engine/generate/index.ts), so every stored Grade 1-5 question identity is byte-for-byte unchanged.
 *
 * GRADE PLACEMENT IS NOT AN ABRSM REQUIREMENT. `bookGrade` is where the reference book prints the term (a 1999 companion workbook list);
 * `lesson` is where this course teaches it. They agree for every entry here. Where the course already taught a book term at a different
 * grade (espressivo, sostenuto, con moto and andantino are book Grade 2, taught at Grade 3; the French list is book Grade 4, taught at
 * Grade 5) nothing was moved, and the difference is recorded for teacher approval (OPEN_QUESTIONS Q2, Q38).
 *
 * All meanings, character descriptions and phrase glosses are newly written. They are provisional until a qualified teacher approves them.
 */
import type { TermCategory } from "./vocabulary.ts";

export const VOCAB_BOOK_VERSION = 1;

/** The kind of thing a term is, used to keep confusable meanings out of one set of options. */
export type BookClass = "speed" | "volume" | "touch" | "structure" | "mood" | "word" | "mark";
/** For mood words: words with the same pole mean nearly the same kind of thing and are never offered together. */
export type BookPole = "gentle" | "strong" | "sad" | "lively" | "free" | "neutral";

export interface TermBook {
  id: string;
  /** The word or sign as the learner sees it. */
  term: string;
  meaning: string;
  category: TermCategory;
  cls: BookClass;
  pole?: BookPole;
  /** Terms in one group mean (nearly) the same: never offered as alternatives to each other. */
  group: string;
  /** The grade at which the reference book prints it. */
  bookGrade: 2 | 3 | 4;
  /** The lesson that teaches it. */
  lesson: string;
  /** Other printed forms (abbreviations, variants). */
  forms?: string[];
  /** Short phrases that use the term, with a gloss. Only phrases whose every word is taught by this lesson or an earlier one. */
  phrases?: Array<{ phrase: string; meaning: string }>;
  /** "A composer wants ___": what kind of music the term suits. Absent for little words and signs. */
  character?: string;
  /** The notation mark a sign is drawn with, for questions that show it. */
  mark?: "staccatissimo" | "strong-accent" | "semi-staccato";
}

const L = (grade: 2 | 3 | 4, n: number) => `G${grade}-U5-L${String(n).padStart(2, "0")}`;
const t = (id: string, term: string, meaning: string, category: TermCategory, cls: BookClass, group: string, bookGrade: 2 | 3 | 4, lesson: string, more: Partial<TermBook> = {}): TermBook => ({ id, term, meaning, category, cls, group, bookGrade, lesson, ...more });

export const TERMS_BOOK: TermBook[] = [
  // ---- Grade 2, lesson 5: little words that change a direction ----------------------------------------------------------------------
  t("a", "a", "at, to, by or in the style of", "expression", "word", "in-style", 2, L(2, 5), { phrases: [{ phrase: "a tempo", meaning: "go back to the speed from before" }] }),
  t("al-alla", "al, alla", "to the, or in the manner of", "expression", "word", "in-style", 2, L(2, 5), { forms: ["al", "alla"], phrases: [{ phrase: "alla marcia", meaning: "in the style of a march" }] }),
  t("con-col", "con, col", "with", "expression", "word", "with", 2, L(2, 5), { forms: ["con", "col"] }),
  t("e-ed", "e, ed", "and", "expression", "word", "and", 2, L(2, 5), { forms: ["e", "ed"] }),
  t("ma", "ma", "but", "expression", "word", "but", 2, L(2, 5)),
  t("non", "non", "not", "expression", "word", "not", 2, L(2, 5)),
  t("senza", "senza", "without", "expression", "word", "without", 2, L(2, 5)),
  // ---- Grade 2, lesson 6: more or less ----------------------------------------------------------------------------------------------
  t("piu", "più", "more", "expression", "word", "more", 2, L(2, 6), { phrases: [{ phrase: "più mosso", meaning: "with more movement: faster" }] }),
  t("meno", "meno", "less", "expression", "word", "less", 2, L(2, 6), { phrases: [{ phrase: "meno mosso", meaning: "with less movement: slower" }] }),
  t("molto", "molto", "very, or much", "expression", "word", "very", 2, L(2, 6), { phrases: [{ phrase: "molto vivace", meaning: "very lively" }] }),
  t("troppo", "troppo", "too much", "expression", "word", "too-much", 2, L(2, 6), { phrases: [{ phrase: "non troppo", meaning: "not too much" }, { phrase: "ma non troppo", meaning: "but not too much" }] }),
  t("assai", "assai", "very", "expression", "word", "very", 2, L(2, 6), { phrases: [{ phrase: "allegro assai", meaning: "very quick" }] }),
  t("mosso", "mosso, moto", "movement", "expression", "word", "movement", 2, L(2, 6), { forms: ["moto"] }),
  // ---- Grade 2, lesson 7: tempo and character words ---------------------------------------------------------------------------------
  t("allargando", "allargando", "broadening: getting a little slower, and usually a little louder", "change-of-speed", "speed", "broaden", 2, L(2, 7), { character: "a grand last chord that slows and broadens as it arrives" }),
  t("grave", "grave", "very slow and solemn", "tempo", "speed", "very-slow", 2, L(2, 7), { character: "a very slow, solemn procession" }),
  t("larghetto", "larghetto", "rather slow, but not as slow as largo", "tempo", "speed", "rather-slow", 2, L(2, 7), { character: "a gentle song that is slowish, though not as slow as a largo" }),
  t("giocoso", "giocoso", "playful and merry", "expression", "mood", "playful", 2, L(2, 7), { pole: "lively", character: "a playful, merry game of tag" }),
  t("simile", "simile (sim.)", "in the same way: carry on as before", "structure", "structure", "carry-on", 2, L(2, 7), { forms: ["sim."], character: "the pattern to carry on being played in the same way as it began" }),
  t("vivo", "vivo", "lively and quick", "tempo", "speed", "lively-quick", 2, L(2, 7), { character: "a quick, bright dance" }),
  // ---- Grade 2, lesson 8: touch signs (staccatissimo is an existing term, taught here for the first time) ---------------------------
  t("pointed-accent", "the sign ∧ (over a note) or ∨ (under it)", "an accent: the note is stressed, as with >, and perhaps even more strongly", "articulation", "touch", "accents", 2, L(2, 8), { mark: "strong-accent", character: "a note that must be hit hard and clearly" }),
  t("semi-staccato", "dots under a slur", "the notes are slightly separated, but less than with ordinary staccato", "articulation", "touch", "separated", 2, L(2, 8), { mark: "semi-staccato", character: "a flowing line whose notes are only slightly separated" }),

  // ---- Grade 3, lesson 5: speed and time ---------------------------------------------------------------------------------------------
  t("adagietto", "adagietto", "rather slow, but a little faster than adagio", "tempo", "speed", "rather-slow", 3, L(3, 5), { character: "a tender song that is slow, but not as slow as an adagio" }),
  t("largamente", "largamente", "broadly", "tempo", "speed", "broad", 3, L(3, 5), { character: "a broad, sweeping tune with a wide, spacious feel" }),
  t("stringendo", "stringendo", "gradually getting faster, pressing on", "change-of-speed", "speed", "faster", 3, L(3, 5), { character: "a chase that speeds up more and more towards the end" }),
  t("alla-breve", "alla breve", "two minim beats in a bar (the sign ¢), which usually feels quicker than the written notes look", "tempo", "speed", "cut-time", 3, L(3, 5), { character: "a march felt as two minim beats in each bar, so that it sounds quicker than the note values suggest" }),
  t("comodo", "comodo", "comfortable: at an easy, convenient speed", "tempo", "speed", "comfortable", 3, L(3, 5), { phrases: [{ phrase: "tempo comodo", meaning: "at a comfortable speed" }], character: "an easy walking tune played at a speed that feels comfortable" }),
  t("rubato", "rubato", "with some freedom of time: the player may push and pull the beat", "expression", "mood", "free-time", 3, L(3, 5), { pole: "free", forms: ["tempo rubato"], phrases: [{ phrase: "tempo rubato", meaning: "with some freedom of time" }], character: "a romantic melody in which the player bends the beat a little for expression" }),
  // ---- Grade 3, lesson 6: strong words -----------------------------------------------------------------------------------------------
  t("forza", "forza", "force, strength", "expression", "mood", "force", 3, L(3, 6), { pole: "strong", character: "a passage played with great strength and force" }),
  t("deciso", "deciso", "with determination", "expression", "mood", "determined", 3, L(3, 6), { pole: "strong", character: "a firm, determined entry that leaves no doubt" }),
  t("risoluto", "risoluto", "bold, strong and resolute", "expression", "mood", "determined", 3, L(3, 6), { pole: "strong", character: "a bold, resolute statement" }),
  t("pesante", "pesante", "heavy", "expression", "mood", "heavy", 3, L(3, 6), { pole: "strong", character: "heavy, stamping steps like a giant walking" }),
  t("marcato", "marcato (marc.)", "emphatic and accented", "articulation", "touch", "emphatic", 3, L(3, 6), { forms: ["marc."], character: "a pattern in which every note is stressed and clear" }),
  t("energico", "energico", "energetic", "expression", "mood", "energy", 3, L(3, 6), { pole: "strong", character: "an energetic dance full of drive" }),
  // ---- Grade 3, lesson 7: gentle words and "how much" words --------------------------------------------------------------------------
  t("delicato", "delicato", "delicate", "expression", "mood", "delicate", 3, L(3, 7), { pole: "gentle", character: "a delicate, fragile tune like snow falling" }),
  t("leggiero", "leggiero", "light and nimble", "expression", "mood", "light", 3, L(3, 7), { pole: "gentle", character: "light, nimble notes, like tiptoeing" }),
  t("tranquillo", "tranquillo", "calm", "expression", "mood", "calm", 3, L(3, 7), { pole: "gentle", character: "a calm lullaby, peaceful and still" }),
  t("semplice", "semplice", "simple and plain", "expression", "mood", "plain", 3, L(3, 7), { pole: "gentle", character: "a plain folk song with no decoration" }),
  t("ben", "ben", "well", "expression", "word", "well", 3, L(3, 7), { phrases: [{ phrase: "ben marcato", meaning: "well marked: clearly emphasised" }] }),
  t("tanto", "tanto", "so much", "expression", "word", "so-much", 3, L(3, 7), { phrases: [{ phrase: "non tanto", meaning: "not so much" }] }),
  // ---- Grade 3, lesson 8: feelings ---------------------------------------------------------------------------------------------------
  t("agitato", "agitato", "agitated and restless", "expression", "mood", "agitated", 3, L(3, 8), { pole: "lively", character: "a restless, agitated storm of notes" }),
  t("mesto", "mesto", "sad", "expression", "mood", "sad", 3, L(3, 8), { pole: "sad", character: "a sad, mournful lament" }),
  t("triste", "triste", "sad and sorrowful", "expression", "mood", "sad", 3, L(3, 8), { pole: "sad", forms: ["tristamente"], character: "a sorrowful song of loss" }),
  t("amore", "amore", "love", "expression", "mood", "love", 3, L(3, 8), { pole: "gentle", phrases: [{ phrase: "amoroso", meaning: "loving" }], character: "a tender song about love" }),
  t("anima", "anima", "soul or spirit", "expression", "mood", "spirit", 3, L(3, 8), { pole: "neutral", phrases: [{ phrase: "con anima", meaning: "with feeling, or spirited" }] }),
  t("animato", "animato", "animated and lively", "expression", "mood", "animated", 3, L(3, 8), { pole: "lively", phrases: [{ phrase: "animando", meaning: "becoming more lively" }], character: "an animated, lively country dance" }),
  // ---- Grade 3, lesson 9: style and character ----------------------------------------------------------------------------------------
  t("marziale", "marziale", "in a military style", "expression", "mood", "military", 3, L(3, 9), { pole: "strong", character: "a military march for a parade" }),
  t("scherzando", "scherzando", "playful and joking", "expression", "mood", "joking", 3, L(3, 9), { pole: "lively", forms: ["scherzoso"], character: "a playful, joking piece, like a clown's tune" }),
  t("brio", "brio", "vigour and spirit", "expression", "mood", "vigour", 3, L(3, 9), { pole: "lively", phrases: [{ phrase: "con brio", meaning: "with vigour: lively and spirited" }], character: "a bright, spirited piece played with vigour" }),
  t("ritmico", "ritmico", "rhythmically: with a bold, clear beat", "expression", "mood", "rhythmic", 3, L(3, 9), { pole: "strong", character: "a piece in which the beat is bold, clear and rhythmic" }),
  // ---- Grade 3, lesson 10: always, suddenly and in order -----------------------------------------------------------------------------
  t("sempre", "sempre", "always", "expression", "word", "always", 3, L(3, 10), { phrases: [{ phrase: "sempre staccato", meaning: "always short and detached" }] }),
  t("subito", "subito", "suddenly", "expression", "word", "suddenly", 3, L(3, 10), { phrases: [{ phrase: "subito piano", meaning: "suddenly quiet" }] }),
  t("prima", "prima, primo", "first", "structure", "structure", "first", 3, L(3, 10), { forms: ["primo"], phrases: [{ phrase: "prima volta", meaning: "the first time" }] }),
  t("seconda", "seconda, secondo", "second", "structure", "structure", "second", 3, L(3, 10), { forms: ["secondo"], phrases: [{ phrase: "seconda volta", meaning: "the second time" }] }),
  t("volta", "volta", "time, as in “once” or “twice”", "structure", "structure", "time-word", 3, L(3, 10), { phrases: [{ phrase: "prima volta", meaning: "the first time" }, { phrase: "seconda volta", meaning: "the second time" }] }),
  t("ad-libitum", "ad libitum (ad lib.)", "at the player's choice: the passage may be played freely", "expression", "mood", "free-choice", 3, L(3, 10), { pole: "free", forms: ["ad lib."], character: "a passage that the player is allowed to take freely, at their own choice" }),

  // ---- Grade 4, lesson 6: the two Italian words not yet in the Grade 4 list --------------------------------------------------------
  t("veloce", "veloce", "swift", "tempo", "speed", "swift", 4, L(4, 6), { character: "a swift, rushing run of notes" }),
  t("voce", "voce", "voice", "expression", "word", "voice", 4, L(4, 6), { phrases: [{ phrase: "sotto voce", meaning: "in an undertone: very softly, as if in a low voice" }] }),
];

/**
 * The new lessons in teaching order, with the book terms each teaches and the older terms they contrast with. The generators only offer a
 * learner a term from this list as a question target, or as a wrong option, once its lesson (or an earlier one) has been taught: the lessons
 * form one unbroken chain on the path, so "lesson k is complete" implies "lessons before k are complete".
 */
export interface BookLesson {
  node: string;
  grade: 2 | 3 | 4;
  title: string;
  /** Ids of terms taught (new ones from TERMS_BOOK; `staccatissimo` is an older id taught here for the first time). */
  termIds: string[];
  conceptId: string;
}

export const BOOK_LESSONS: BookLesson[] = [
  { node: "G2-U5-L05", grade: 2, title: "Little words that change a direction", termIds: ["a", "al-alla", "con-col", "e-ed", "ma", "non", "senza"], conceptId: "c.terms.g2-link" },
  { node: "G2-U5-L06", grade: 2, title: "More, less, very and too much", termIds: ["piu", "meno", "molto", "troppo", "assai", "mosso"], conceptId: "c.terms.g2-more" },
  { node: "G2-U5-L07", grade: 2, title: "More tempo and character words", termIds: ["allargando", "grave", "larghetto", "giocoso", "simile", "vivo"], conceptId: "c.terms.g2-character" },
  { node: "G2-U5-L08", grade: 2, title: "Wedge, pointed accent and dots under a slur", termIds: ["staccatissimo", "pointed-accent", "semi-staccato"], conceptId: "c.terms.g2-touch" },
  { node: "G3-U5-L05", grade: 3, title: "Speed and time", termIds: ["adagietto", "largamente", "stringendo", "alla-breve", "comodo", "rubato"], conceptId: "c.terms.g3-speed" },
  { node: "G3-U5-L06", grade: 3, title: "Strong words", termIds: ["forza", "deciso", "risoluto", "pesante", "marcato", "energico"], conceptId: "c.terms.g3-strong" },
  { node: "G3-U5-L07", grade: 3, title: "Gentle words, and how much", termIds: ["delicato", "leggiero", "tranquillo", "semplice", "ben", "tanto"], conceptId: "c.terms.g3-gentle" },
  { node: "G3-U5-L08", grade: 3, title: "Feelings", termIds: ["agitato", "mesto", "triste", "amore", "anima", "animato"], conceptId: "c.terms.g3-feelings" },
  { node: "G3-U5-L09", grade: 3, title: "Style and character", termIds: ["marziale", "scherzando", "brio", "ritmico"], conceptId: "c.terms.g3-style" },
  { node: "G3-U5-L10", grade: 3, title: "Always, suddenly and in order", termIds: ["sempre", "subito", "prima", "seconda", "volta", "ad-libitum"], conceptId: "c.terms.g3-order" },
  { node: "G4-U5-L06", grade: 4, title: "Two more Grade 4 words", termIds: ["veloce", "voce"], conceptId: "c.terms.g4-more" },
];

/** Templates of this terminology work. They carry VOCAB_BOOK in their generation fingerprint and are offered only to learners who completed a lesson that teaches them. */
export const BOOK_TEMPLATE_IDS: readonly string[] = ["t.g2.book-terms", "t.g2.book-use", "t.g3.book-terms", "t.g3.book-use", "t.g4.book-terms", "t.g4.book-use"];
export const isBookTemplate = (templateId: string): boolean => BOOK_TEMPLATE_IDS.includes(templateId);

/** The terms of a grade's book lessons, in teaching order. */
export const bookTermsOfGrade = (grade: number): string[] => BOOK_LESSONS.filter((l) => l.grade === grade).flatMap((l) => l.termIds);

/** The vocabulary as one value, for the generation fingerprint of the `*.book-*` templates. */
export const VOCAB_BOOK = { version: VOCAB_BOOK_VERSION, terms: TERMS_BOOK, lessons: BOOK_LESSONS };
