/**
 * Grade 4 generators (Brief 08): registry. One generator per new template. A generator listed here replaces the family generator
 * for that template id, which is safe because no Grade 4 content was playable before this brief, so no stored question identity
 * exists for a Grade 4 template. Grade 1-3 generators are never touched.
 */
import { GENERATORS, type Gen } from "./families.ts";
import { breveBar, breveFacts, doubleDotBar, doubleDotFacts, dupletFacts, dupletRead, groupingJudge4, metreFacts4, timeSigRead4 } from "./grade4-rhythm.ts";
import { doubleRead, altoFacts, chromaticJudge, clefPosition, degreeName, doubleCancel, doubleFacts, doubleName, doubleWrite, enharmonicLetter, enharmonicPick, keyFacts4, octavePickAlto, samePitch4, scaleSpot } from "./grade4-pitch.ts";
import { chordBuild4, chordInPassage4, chordRoot, chordSpread, intervalFacts4, intervalName4, intervalWrite4, triadId, triadNotes4 } from "./grade4-harmony.ts";
import { instruments4, ornamentBar, ornamentFacts, ornamentSpot, passage4, passageDirections, techniqueFacts, termUse4, terms4 } from "./grade4-context.ts";

/** The provisional family generator for a template, run as it is. */
const family = (familyId: string): Gen => (c) => GENERATORS[familyId]?.(c.template)?.(c) ?? null;
type Draftish = { prompt: string; music?: { clef?: string }; answer: { clef?: string } & Record<string, unknown> } & Record<string, unknown>;
const altoWords = (d: Draftish) => /alto/i.test(d.prompt);

/** Alto-clef reading: the prompt says so, so the question is plainly about the alto clef (concept boundary: prompt must name it). */
const altoRead: Gen = (c) => {
  const d = family("fam.note-read")(c) as Draftish | null;
  if (!d || d.music?.clef !== "alto") return null;
  return { ...d, prompt: d.prompt.replace("this note", "this note in the alto clef") } as never;
};
/** Key signatures: items in the alto clef say so. */
const keySignature4: Gen = (c) => {
  const d = family("fam.key-signature")(c) as Draftish | null;
  if (!d) return null;
  return (d.answer.clef === "alto" && !altoWords(d) ? { ...d, prompt: `${d.prompt} The key signature is written in the alto clef.` } : d) as never;
};
/** Octave transposition: only questions that involve the alto clef (treble to bass is Grade 3 and earns no Grade 4 credit). */
const octaveAlto: Gen = (c) => {
  const d = family("fam.transposition")(c) as Draftish | null;
  if (!d) return null;
  const from = d.music?.clef;
  const to = d.answer.clef;
  if (from !== "alto" && to !== "alto") return null;
  if (from === to) return null;
  return (altoWords(d) ? d : { ...d, prompt: `${d.prompt} (The original melody is in the alto clef.)` }) as never;
};

export const GRADE4_GENERATORS: Record<string, Gen> = {
  // The provisional templates that keep a family generator, adapted where the Grade 4 boundary needs it
  "t.g4.alto-read": altoRead,
  "t.g4.key-signature": keySignature4,
  "t.g4.octave-transpose-alto": octaveAlto,
  "t.g4.time-signature": timeSigRead4,
  "t.g4.double-accidental": doubleRead,
  // Unit 1
  "t.g4.breve-facts": breveFacts,
  "t.g4.breve-bar": breveBar,
  "t.g4.double-dot-facts": doubleDotFacts,
  "t.g4.double-dot-bar": doubleDotBar,
  "t.g4.metre-facts": metreFacts4,
  "t.g4.grouping-judge": groupingJudge4,
  "t.g4.duplet-facts": dupletFacts,
  "t.g4.duplet-read": dupletRead,
  // Unit 2
  "t.g4.double-facts": doubleFacts,
  "t.g4.double-name": doubleName,
  "t.g4.double-write": doubleWrite,
  "t.g4.double-cancel": doubleCancel,
  "t.g4.enharmonic-letter": enharmonicLetter,
  "t.g4.enharmonic-pick": enharmonicPick,
  "t.g4.alto-facts": altoFacts,
  "t.g4.same-pitch": samePitch4,
  "t.g4.clef-position": clefPosition,
  "t.g4.octave-pick-alto": octavePickAlto,
  // Unit 3
  "t.g4.key-facts": keyFacts4,
  "t.g4.scale-spot": scaleSpot,
  "t.g4.degree-name": degreeName,
  "t.g4.chromatic-judge": chromaticJudge,
  // Unit 4
  "t.g4.interval-name": intervalName4,
  "t.g4.interval-write": intervalWrite4,
  "t.g4.interval-facts": intervalFacts4,
  "t.g4.triad-notes": triadNotes4,
  "t.g4.triad-id": triadId,
  "t.g4.chord-spread": chordSpread,
  "t.g4.chord-root": chordRoot,
  "t.g4.chord-build": chordBuild4,
  "t.g4.chord-in-passage": chordInPassage4,
  // Unit 5
  "t.g4.ornament-spot": ornamentSpot,
  "t.g4.ornament-facts": ornamentFacts,
  "t.g4.ornament-bar": ornamentBar,
  "t.g4.instruments": instruments4,
  "t.g4.technique-facts": techniqueFacts,
  "t.g4.terms": terms4,
  "t.g4.term-use": termUse4,
  "t.g4.passage": passage4,
  "t.g4.passage-directions": passageDirections,
};
