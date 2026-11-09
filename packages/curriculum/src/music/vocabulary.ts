/**
 * Controlled vocabularies (rules.vocabulary.terms / .instruments / .voices).
 *
 * STATUS: provisional. OPEN_QUESTIONS Q2 records that the authoritative per-grade term lists must come from
 * the current official syllabus and be approved by a qualified teacher. These entries are standard musical
 * facts with newly written, plain-English meanings. `firstGrade` is the earliest grade at which the term is
 * used in this course; generators only draw terms at or below the item's grade. Grading never depends on the
 * wording here: a choice item stores option ids, and the vocabulary is used to build distractors from the
 * same category so options never duplicate a meaning.
 */

export type TermCategory = "tempo" | "dynamics" | "expression" | "articulation" | "change-of-speed" | "structure" | "sign";
export interface Term {
  id: string;
  term: string;
  meaning: string;
  category: TermCategory;
  firstGrade: number;
  /** Ids of terms with the opposite meaning (for "opposite-meaning" diagnosis). */
  opposite?: string[];
  /** Ids of terms easily confused with this one ("confused-similar-term"). */
  similar?: string[];
}

export const TERMS: Term[] = [
  { id: "allegro", term: "allegro", meaning: "fast and lively", category: "tempo", firstGrade: 1, opposite: ["lento", "adagio"], similar: ["allegretto"] },
  { id: "andante", term: "andante", meaning: "at a walking pace", category: "tempo", firstGrade: 1, similar: ["andantino"] },
  { id: "adagio", term: "adagio", meaning: "slow", category: "tempo", firstGrade: 1, opposite: ["allegro", "presto"], similar: ["lento", "largo"] },
  { id: "lento", term: "lento", meaning: "slow", category: "tempo", firstGrade: 1, opposite: ["allegro", "presto"], similar: ["adagio", "largo"] },
  { id: "moderato", term: "moderato", meaning: "at a moderate speed", category: "tempo", firstGrade: 1 },
  { id: "allegretto", term: "allegretto", meaning: "fairly quick, but not as fast as allegro", category: "tempo", firstGrade: 1, similar: ["allegro"] },
  { id: "presto", term: "presto", meaning: "very fast", category: "tempo", firstGrade: 2, opposite: ["lento", "adagio"], similar: ["prestissimo"] },
  { id: "largo", term: "largo", meaning: "slow and broad", category: "tempo", firstGrade: 2, similar: ["lento", "adagio"] },
  { id: "vivace", term: "vivace", meaning: "lively and quick", category: "tempo", firstGrade: 2, similar: ["allegro"] },
  { id: "andantino", term: "andantino", meaning: "a little faster than andante", category: "tempo", firstGrade: 3, similar: ["andante"] },
  { id: "prestissimo", term: "prestissimo", meaning: "as fast as possible", category: "tempo", firstGrade: 3, similar: ["presto"] },
  { id: "piano", term: "piano (p)", meaning: "quiet", category: "dynamics", firstGrade: 1, opposite: ["forte"], similar: ["mezzo-piano"] },
  { id: "forte", term: "forte (f)", meaning: "loud", category: "dynamics", firstGrade: 1, opposite: ["piano"], similar: ["mezzo-forte"] },
  { id: "mezzo-piano", term: "mezzo piano (mp)", meaning: "moderately quiet", category: "dynamics", firstGrade: 1, opposite: ["mezzo-forte"], similar: ["piano"] },
  { id: "mezzo-forte", term: "mezzo forte (mf)", meaning: "moderately loud", category: "dynamics", firstGrade: 1, opposite: ["mezzo-piano"], similar: ["forte"] },
  { id: "pianissimo", term: "pianissimo (pp)", meaning: "very quiet", category: "dynamics", firstGrade: 1, opposite: ["fortissimo"], similar: ["piano"] },
  { id: "fortissimo", term: "fortissimo (ff)", meaning: "very loud", category: "dynamics", firstGrade: 1, opposite: ["pianissimo"], similar: ["forte"] },
  { id: "crescendo", term: "crescendo (cresc.)", meaning: "gradually getting louder", category: "dynamics", firstGrade: 1, opposite: ["diminuendo", "decrescendo"] },
  { id: "diminuendo", term: "diminuendo (dim.)", meaning: "gradually getting quieter", category: "dynamics", firstGrade: 1, opposite: ["crescendo"], similar: ["decrescendo"] },
  { id: "decrescendo", term: "decrescendo (decresc.)", meaning: "gradually getting quieter", category: "dynamics", firstGrade: 1, opposite: ["crescendo"], similar: ["diminuendo"] },
  { id: "sforzando", term: "sforzando (sf)", meaning: "with a sudden strong accent", category: "dynamics", firstGrade: 2 },
  { id: "fortepiano", term: "fortepiano (fp)", meaning: "loud, then immediately quiet", category: "dynamics", firstGrade: 2 },
  { id: "rallentando", term: "rallentando (rall.)", meaning: "gradually getting slower", category: "change-of-speed", firstGrade: 1, opposite: ["accelerando"], similar: ["ritardando", "ritenuto"] },
  { id: "ritardando", term: "ritardando (rit.)", meaning: "gradually getting slower", category: "change-of-speed", firstGrade: 1, opposite: ["accelerando"], similar: ["rallentando", "ritenuto"] },
  { id: "accelerando", term: "accelerando (accel.)", meaning: "gradually getting faster", category: "change-of-speed", firstGrade: 1, opposite: ["rallentando", "ritardando"] },
  { id: "a-tempo", term: "a tempo", meaning: "return to the previous speed", category: "change-of-speed", firstGrade: 1, similar: ["tempo-primo"] },
  { id: "ritenuto", term: "ritenuto (rit., riten.)", meaning: "held back; slower at once", category: "change-of-speed", firstGrade: 2, similar: ["rallentando"] },
  { id: "tempo-primo", term: "tempo primo", meaning: "return to the speed at the start", category: "change-of-speed", firstGrade: 3, similar: ["a-tempo"] },
  { id: "legato", term: "legato", meaning: "smoothly, with the notes joined", category: "articulation", firstGrade: 1, opposite: ["staccato"] },
  { id: "staccato", term: "staccato", meaning: "short and detached", category: "articulation", firstGrade: 1, opposite: ["legato"], similar: ["staccatissimo"] },
  { id: "staccatissimo", term: "staccatissimo", meaning: "very short and detached", category: "articulation", firstGrade: 4, similar: ["staccato"] },
  { id: "tenuto", term: "tenuto", meaning: "held: give the note its full length", category: "articulation", firstGrade: 2 },
  { id: "accent", term: "accent (>)", meaning: "emphasise the note", category: "articulation", firstGrade: 1 },
  { id: "cantabile", term: "cantabile", meaning: "in a singing style", category: "expression", firstGrade: 1 },
  { id: "dolce", term: "dolce", meaning: "sweetly", category: "expression", firstGrade: 1 },
  { id: "grazioso", term: "grazioso", meaning: "gracefully", category: "expression", firstGrade: 2 },
  { id: "maestoso", term: "maestoso", meaning: "majestically", category: "expression", firstGrade: 2 },
  { id: "espressivo", term: "espressivo (espress.)", meaning: "expressively", category: "expression", firstGrade: 3 },
  { id: "sostenuto", term: "sostenuto", meaning: "sustained", category: "expression", firstGrade: 3 },
  { id: "con-moto", term: "con moto", meaning: "with movement", category: "expression", firstGrade: 3 },
  { id: "da-capo", term: "da capo (D.C.)", meaning: "repeat from the beginning", category: "structure", firstGrade: 1, similar: ["dal-segno"] },
  { id: "fine", term: "fine", meaning: "the end", category: "structure", firstGrade: 1 },
  { id: "dal-segno", term: "dal segno (D.S.)", meaning: "repeat from the sign", category: "structure", firstGrade: 2, similar: ["da-capo"] },
  { id: "fermata", term: "pause (fermata)", meaning: "hold the note longer than its written value", category: "sign", firstGrade: 1 },
  { id: "slur", term: "slur", meaning: "play the notes under the curve smoothly", category: "sign", firstGrade: 1, similar: ["tie"] },
  { id: "tie", term: "tie", meaning: "join two notes of the same pitch into one longer sound", category: "sign", firstGrade: 1, similar: ["slur"] },
  { id: "repeat", term: "repeat marks", meaning: "play the passage between the marks again", category: "sign", firstGrade: 1 },
  { id: "ottava", term: "8va", meaning: "play an octave higher than written", category: "sign", firstGrade: 4 },
];

export interface InstrumentInfo {
  id: string;
  name: string;
  family: "strings" | "woodwind" | "brass" | "percussion" | "keyboard";
  clefs: Array<"treble" | "bass" | "alto" | "tenor">;
  /** null = sounds as written. Interval by which written is above sounding, e.g. "M2". */
  transposition: string | null;
  sound: string;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  { id: "violin", name: "violin", family: "strings", clefs: ["treble"], transposition: null, sound: "bowed or plucked strings" },
  { id: "viola", name: "viola", family: "strings", clefs: ["alto", "treble"], transposition: null, sound: "bowed or plucked strings" },
  { id: "cello", name: "cello", family: "strings", clefs: ["bass", "tenor", "treble"], transposition: null, sound: "bowed or plucked strings" },
  { id: "double-bass", name: "double bass", family: "strings", clefs: ["bass"], transposition: "P8 (sounds an octave lower)", sound: "bowed or plucked strings" },
  { id: "flute", name: "flute", family: "woodwind", clefs: ["treble"], transposition: null, sound: "air blown across an opening" },
  { id: "oboe", name: "oboe", family: "woodwind", clefs: ["treble"], transposition: null, sound: "a double reed" },
  { id: "clarinet", name: "clarinet", family: "woodwind", clefs: ["treble"], transposition: "M2 (in B♭) or m3 (in A)", sound: "a single reed" },
  { id: "bassoon", name: "bassoon", family: "woodwind", clefs: ["bass", "tenor"], transposition: null, sound: "a double reed" },
  { id: "horn", name: "horn", family: "brass", clefs: ["treble", "bass"], transposition: "P5 (in F)", sound: "lips buzzing into a mouthpiece" },
  { id: "trumpet", name: "trumpet", family: "brass", clefs: ["treble"], transposition: "M2 (in B♭)", sound: "lips buzzing into a mouthpiece" },
  { id: "trombone", name: "trombone", family: "brass", clefs: ["bass", "tenor"], transposition: null, sound: "lips buzzing into a mouthpiece; a slide changes the pitch" },
  { id: "tuba", name: "tuba", family: "brass", clefs: ["bass"], transposition: null, sound: "lips buzzing into a mouthpiece" },
  { id: "timpani", name: "timpani", family: "percussion", clefs: ["bass"], transposition: null, sound: "tuned drums struck with sticks" },
  { id: "xylophone", name: "xylophone", family: "percussion", clefs: ["treble"], transposition: null, sound: "wooden bars struck with beaters" },
  { id: "piano", name: "piano", family: "keyboard", clefs: ["treble", "bass"], transposition: null, sound: "hammers striking strings" },
];

export interface VoiceInfo {
  id: string;
  name: string;
  /** Approximate comfortable range, for teaching only (teacher review required). */
  range: [string, string];
  clef: "treble" | "bass";
}

export const VOICES: VoiceInfo[] = [
  { id: "soprano", name: "soprano", range: ["C4", "A5"], clef: "treble" },
  { id: "mezzo-soprano", name: "mezzo-soprano", range: ["A3", "F5"], clef: "treble" },
  { id: "alto", name: "alto (contralto)", range: ["F3", "D5"], clef: "treble" },
  { id: "tenor", name: "tenor", range: ["C3", "A4"], clef: "treble" },
  { id: "baritone", name: "baritone", range: ["A2", "F4"], clef: "bass" },
  { id: "bass", name: "bass", range: ["E2", "D4"], clef: "bass" },
];

export const termsUpTo = (grade: number) => TERMS.filter((t) => t.firstGrade <= grade);
