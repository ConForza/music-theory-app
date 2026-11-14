/**
 * Grade 5 generators (Brief 09): registry. One generator per Grade 5 template. A generator listed here replaces the family generator for
 * that template id, which is safe because no Grade 5 content was playable before this brief, so no stored question identity exists for a
 * Grade 5 template. Grade 1-4 generators are never touched.
 */
import type { Gen } from "./families.ts";
import { describeScore, describeStave } from "./grade4-text.ts";
import { clefPosition5, compoundFacts5, concertFacts5, fourClefRead, intervalAny5, intervalCompound5, intervalFacts5, intervalWrite5, instrumentTranspose5, keyFacts5, keySignature5, octaveTranspose5, samePitch5, scaleBuild5, scaleSpot5, tenorFacts, tenorRead, tenorWrite, transposeKey5 } from "./grade5-pitch.ts";
import { instrumentSound5, instruments5, ornamentFacts5, ornamentReplace5, score5, termUse5, terms5, voices5 } from "./grade5-context.ts";
import { approachChord5, cadenceChords5, cadenceFacts5, cadenceFind5, cadenceIdentify5, chordBuild5, chordIdentify5, chordInPassage5, inversionFacts5, satbFacts5, satbVoices5, sixFourFiveThree5, supertonicFacts5 } from "./grade5-harmony.ts";
import { barComplete5, divisionFacts5, divisionWrite5, groupingJudge5, irregularDivision5, irregularGrouping5, metreFacts5, timeSigIrregular } from "./grade5-rhythm.ts";


/** Every stave a Grade 5 generator draws is described from the notation it really contains (grade4-text.ts), not from what the generator meant to draw. */
const described = (g: Gen): Gen => (c) => {
  let raw: ReturnType<Gen>;
  try { raw = g(c); } catch { return null; } // a candidate the rules cannot spell (for example a triple sharp) is simply not used
  const d = raw as (Record<string, unknown> & { music?: { presentation?: string; textAlternative: string; questionAlternative?: string }; score?: never }) | null;
  if (!d) return d as never;
  const out: Record<string, unknown> = { ...d };
  if (d.music && d.music.presentation === "stave") out.music = { ...d.music, textAlternative: describeStave(d.music as never), ...(d.music.questionAlternative ? { questionAlternative: describeStave(d.music as never) } : {}) };
  if (d.score) out.score = describeScore(d.score as never, (d.score as { textAlternative: string }).textAlternative.split(/(Treble|Bass) stave/)[0]!.trim() || "A passage on two staves.");
  return out as never;
};

const REGISTRY: Record<string, Gen> = {
  // Unit 1
  "t.g5.time-signature": timeSigIrregular,
  "t.g5.metre-facts": metreFacts5,
  "t.g5.grouping-judge": groupingJudge5,
  "t.g5.irregular-grouping": irregularGrouping5,
  "t.g5.bar-complete": barComplete5,
  "t.g5.irregular-division": irregularDivision5,
  "t.g5.division-facts": divisionFacts5,
  "t.g5.division-write": divisionWrite5,
  // Unit 2
  "t.g5.tenor-read": tenorRead,
  "t.g5.tenor-write": tenorWrite,
  "t.g5.tenor-facts": tenorFacts,
  "t.g5.four-clef-read": fourClefRead,
  "t.g5.same-pitch": samePitch5,
  "t.g5.clef-position": clefPosition5,
  "t.g5.octave-transpose": octaveTranspose5,
  "t.g5.key-signature": keySignature5,
  // Unit 3
  "t.g5.scale-build": scaleBuild5,
  "t.g5.key-facts": keyFacts5,
  "t.g5.scale-spot": scaleSpot5,
  "t.g5.interval-any": intervalAny5,
  "t.g5.interval-write": intervalWrite5,
  "t.g5.interval-compound": intervalCompound5,
  "t.g5.interval-facts": intervalFacts5,
  "t.g5.compound-facts": compoundFacts5,
  "t.g5.concert-facts": concertFacts5,
  "t.g5.transpose-key": transposeKey5,
  "t.g5.instrument-transpose": instrumentTranspose5,
  // Unit 4
  "t.g5.chord-identify": chordIdentify5,
  "t.g5.chord-build": chordBuild5,
  "t.g5.inversion-facts": inversionFacts5,
  "t.g5.supertonic-facts": supertonicFacts5,
  "t.g5.chord-in-passage": chordInPassage5,
  "t.g5.cadence-identify": cadenceIdentify5,
  "t.g5.cadence-find": cadenceFind5,
  "t.g5.cadence-facts": cadenceFacts5,
  "t.g5.cadence-chords": cadenceChords5,
  "t.g5.cadential-six-four": sixFourFiveThree5,
  "t.g5.approach-chord": approachChord5,
  "t.g5.satb-voices": satbVoices5,
  "t.g5.satb-facts": satbFacts5,
  // Unit 5
  "t.g5.ornament-replace": ornamentReplace5,
  "t.g5.ornament-facts": ornamentFacts5,
  "t.g5.voices": voices5,
  "t.g5.instruments": instruments5,
  "t.g5.instrument-sound": instrumentSound5,
  "t.g5.terms": terms5,
  "t.g5.term-use": termUse5,
  "t.g5.score": score5,
};

export const GRADE5_GENERATORS: Record<string, Gen> = Object.fromEntries(Object.entries(REGISTRY).map(([id, g]) => [id, described(g)]));
