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
  { id: "ritenuto", term: "ritenuto (riten.)", meaning: "held back; slower at once", category: "change-of-speed", firstGrade: 1, similar: ["rallentando"] },
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
  { id: "dal-segno", term: "dal segno (D.S.)", meaning: "repeat from the sign", category: "structure", firstGrade: 1, similar: ["da-capo"] },
  { id: "fermata", term: "pause (fermata)", meaning: "hold the note longer than its written value", category: "sign", firstGrade: 1 },
  { id: "slur", term: "slur", meaning: "play the notes under the curve smoothly", category: "sign", firstGrade: 1, similar: ["tie"] },
  { id: "tie", term: "tie", meaning: "join two notes of the same pitch into one longer sound", category: "sign", firstGrade: 1, similar: ["slur"] },
  { id: "repeat", term: "repeat marks", meaning: "play the passage between the marks again", category: "sign", firstGrade: 1 },
  { id: "ottava", term: "8va", meaning: "play an octave higher than written", category: "sign", firstGrade: 1 },
  { id: "poco", term: "poco", meaning: "a little", category: "expression", firstGrade: 1 },
  { id: "metronome-mark", term: "M.M. ♩ = 72", meaning: "72 crotchet beats in a minute", category: "sign", firstGrade: 1 },
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
  { id: "xylophone", name: "xylophone", family: "percussion", clefs: ["treble"], transposition: "P8 (sounds an octave higher)", sound: "wooden bars struck with beaters" },
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

// ---------------------------------------------------------------------------
// Grade 4 vocabulary (Brief 08). VERSIONED AND KEPT SEPARATE on purpose: `TERMS`, `INSTRUMENTS` and `VOICES` above are part of
// every Grade 1-3 generation fingerprint, so editing them would silently change the identity of every stored question. The
// Grade 4 lists below are added to the fingerprint of Grade 4 templates only (engine/generate/index.ts).
//
// STATUS: provisional (OPEN_QUESTIONS Q2). The term list is the one the reference book states is used for Grade 4; the official
// outline publishes no list, so a qualified teacher must confirm it. Meanings are newly written.
// ---------------------------------------------------------------------------

export const VOCAB_G4_VERSION = 1;

export interface TermG4 {
  id: string;
  term: string;
  meaning: string;
  category: TermCategory;
  /** Terms in the same group mean (nearly) the same: they are never offered as alternatives to each other. */
  group: string;
}

export const TERMS_G4: TermG4[] = [
  { id: "affettuoso", term: "affettuoso", meaning: "tenderly, with affection", category: "expression", group: "tender" },
  { id: "affrettando", term: "affrettando", meaning: "hurrying, pressing on", category: "change-of-speed", group: "hurry" },
  { id: "amabile", term: "amabile", meaning: "in a pleasant, amiable way", category: "expression", group: "pleasant" },
  { id: "appassionato", term: "appassionato", meaning: "with passion", category: "expression", group: "passion" },
  { id: "calando", term: "calando", meaning: "getting softer and (usually) slower", category: "change-of-speed", group: "fading" },
  { id: "cantando", term: "cantando", meaning: "in a singing style", category: "expression", group: "singing" },
  { id: "come-prima", term: "come prima", meaning: "as before", category: "structure", group: "as-before" },
  { id: "come-sopra", term: "come sopra", meaning: "as above", category: "structure", group: "as-above" },
  { id: "facile", term: "facile", meaning: "easily, without effort", category: "expression", group: "easy" },
  { id: "con-fuoco", term: "con fuoco", meaning: "with fire", category: "expression", group: "fire" },
  { id: "tempo-giusto", term: "tempo giusto", meaning: "in strict, exact time", category: "tempo", group: "exact" },
  { id: "l-istesso-tempo", term: "l'istesso tempo", meaning: "at the same speed as before", category: "change-of-speed", group: "same-speed" },
  { id: "morendo", term: "morendo", meaning: "dying away", category: "change-of-speed", group: "fading" },
  { id: "niente", term: "niente", meaning: "nothing (as in “to nothing”)", category: "expression", group: "nothing" },
  { id: "nobilmente", term: "nobilmente", meaning: "nobly", category: "expression", group: "noble" },
  { id: "perdendosi", term: "perdendosi", meaning: "fading away until lost", category: "change-of-speed", group: "fading" },
  { id: "presto-possibile", term: "presto possibile", meaning: "as fast as possible", category: "tempo", group: "fastest" },
  { id: "quasi", term: "quasi", meaning: "as if, almost like", category: "expression", group: "as-if" },
  { id: "sonoro", term: "sonoro", meaning: "with a full, resonant tone", category: "expression", group: "resonant" },
  { id: "sopra", term: "sopra", meaning: "above", category: "structure", group: "above" },
  { id: "sotto-voce", term: "sotto voce", meaning: "in an undertone, very softly", category: "dynamics", group: "undertone" },
];

export interface TechniqueG4 {
  id: string;
  term: string;
  meaning: string;
  /** What kind of instruments it applies to. */
  applies: "strings" | "strings-and-brass";
}

/** Instrumental techniques and directions of the reference book's Grade 4 section 15 (own wording). */
export const TECHNIQUES_G4: TechniqueG4[] = [
  { id: "pizzicato", term: "pizzicato (pizz.)", meaning: "pluck the strings with the fingers instead of using the bow", applies: "strings" },
  { id: "arco", term: "arco", meaning: "play with the bow (usually to cancel pizzicato)", applies: "strings" },
  { id: "con-sordino", term: "con sordino (con sord.)", meaning: "play with the mute on", applies: "strings-and-brass" },
  { id: "senza-sordino", term: "senza sordino (senza sord.)", meaning: "play without the mute", applies: "strings-and-brass" },
  { id: "sul-g", term: "sul G", meaning: "play on the G string", applies: "strings" },
  { id: "sul-ponticello", term: "sul ponticello", meaning: "play with the bow near the bridge", applies: "strings" },
  { id: "down-bow", term: "the sign ⊓ (down-bow)", meaning: "play this note with a down-bow", applies: "strings" },
  { id: "up-bow", term: "the sign ∨ (up-bow)", meaning: "play this note with an up-bow", applies: "strings" },
];

export interface InstrumentG4 {
  id: string;
  name: string;
  family: "strings" | "woodwind" | "brass" | "percussion";
  /** The clef the instrument normally reads, as the reference book lists it (none is given for any percussion instrument, so none is asked). */
  clef: "treble" | "bass" | "alto" | null;
  /** Rank within the family, 1 = the instrument that can play the highest notes (reference book's list order). */
  rank: number;
  pitched: boolean;
}

export const INSTRUMENTS_G4: InstrumentG4[] = [
  { id: "violin", name: "violin", family: "strings", clef: "treble", rank: 1, pitched: true },
  { id: "viola", name: "viola", family: "strings", clef: "alto", rank: 2, pitched: true },
  { id: "cello", name: "cello", family: "strings", clef: "bass", rank: 3, pitched: true },
  { id: "double-bass", name: "double bass", family: "strings", clef: "bass", rank: 4, pitched: true },
  { id: "flute", name: "flute", family: "woodwind", clef: "treble", rank: 1, pitched: true },
  { id: "oboe", name: "oboe", family: "woodwind", clef: "treble", rank: 2, pitched: true },
  { id: "clarinet", name: "clarinet", family: "woodwind", clef: "treble", rank: 3, pitched: true },
  { id: "bassoon", name: "bassoon", family: "woodwind", clef: "bass", rank: 4, pitched: true },
  { id: "trumpet", name: "trumpet", family: "brass", clef: "treble", rank: 1, pitched: true },
  { id: "horn", name: "horn", family: "brass", clef: "treble", rank: 2, pitched: true },
  { id: "trombone", name: "trombone", family: "brass", clef: "bass", rank: 3, pitched: true },
  { id: "tuba", name: "tuba", family: "brass", clef: "bass", rank: 4, pitched: true },
  { id: "timpani", name: "timpani", family: "percussion", clef: null, rank: 1, pitched: true },
  { id: "side-drum", name: "side drum", family: "percussion", clef: null, rank: 2, pitched: false },
  { id: "bass-drum", name: "bass drum", family: "percussion", clef: null, rank: 3, pitched: false },
  { id: "cymbals", name: "cymbals", family: "percussion", clef: null, rank: 4, pitched: false },
];

/** The Grade 4 vocabulary as one value, for the generation fingerprint of Grade 4 templates. */
export const VOCAB_G4 = { version: VOCAB_G4_VERSION, terms: TERMS_G4, techniques: TECHNIQUES_G4, instruments: INSTRUMENTS_G4 };

// ---------------------------------------------------------------------------
// Grade 5 vocabulary (Brief 09). VERSIONED AND KEPT SEPARATE, exactly as the Grade 4 lists above: `TERMS`, `INSTRUMENTS`, `VOICES`
// and the Grade 4 lists are part of the generation fingerprint of earlier templates, so none of them is edited. `VOCAB_G5` joins the
// fingerprint of Grade 5 templates only (engine/generate/index.ts).
//
// STATUS: provisional (OPEN_QUESTIONS Q2). The Italian and German lists are the ones the reference book (First Steps, Grade 5
// section 15, pp. 140-142, read in the supplied PDF) gives for Grade 5; the official outline publishes no list, so a qualified
// teacher must confirm them. All meanings are newly written. Grade 4 terms are NOT in these lists, so a Grade 4 term never earns
// Grade 5 terminology credit.
// ---------------------------------------------------------------------------

export const VOCAB_G5_VERSION = 1;

export type TermLanguage = "italian" | "german" | "direction";
export interface TermG5 {
  id: string;
  term: string;
  meaning: string;
  language: TermLanguage;
  /** Terms in one group mean (nearly) the same: they are never offered as alternatives to each other. */
  group: string;
}

export const TERMS_G5: TermG5[] = [
  { id: "attacca", term: "attacca", meaning: "go straight on to the next section", language: "italian", group: "go-on" },
  { id: "segue", term: "segue", meaning: "go straight on", language: "italian", group: "go-on" },
  { id: "dolente", term: "dolente", meaning: "sad, mournful", language: "italian", group: "sad" },
  { id: "dolore", term: "dolore", meaning: "grief", language: "italian", group: "grief" },
  { id: "lacrimoso", term: "lacrimoso", meaning: "tearful, sad", language: "italian", group: "sad" },
  { id: "piangevole", term: "piangevole", meaning: "plaintive, in the style of a lament", language: "italian", group: "sad" },
  { id: "doppio-movimento", term: "doppio movimento", meaning: "twice as fast", language: "italian", group: "twice-fast" },
  { id: "estinto", term: "estinto", meaning: "as soft as possible, lifeless", language: "italian", group: "softest" },
  { id: "incalzando", term: "incalzando", meaning: "getting quicker, pressing forward", language: "italian", group: "quicker" },
  { id: "loco", term: "loco", meaning: "at the normal pitch (cancels an 8va sign)", language: "italian", group: "normal-pitch" },
  { id: "lunga", term: "lunga", meaning: "long (as in lunga pausa, a long pause)", language: "italian", group: "long" },
  { id: "lusingando", term: "lusingando", meaning: "coaxing, in a sweet and persuasive style", language: "italian", group: "coaxing" },
  { id: "misura", term: "misura", meaning: "measure (alla misura: in strict time; senza misura: in free time)", language: "italian", group: "measure" },
  { id: "ossia", term: "ossia", meaning: "or, alternatively", language: "italian", group: "alternatively" },
  { id: "piacevole", term: "piacevole", meaning: "pleasant", language: "italian", group: "pleasant" },
  { id: "pochettino", term: "pochettino (poch.)", meaning: "rather little", language: "italian", group: "little" },
  { id: "rinforzando", term: "rinforzando (rf, rfz)", meaning: "reinforcing: a sudden stress on a note or chord", language: "italian", group: "reinforcing" },
  { id: "smorzando", term: "smorzando (smorz.)", meaning: "dying away in tone and speed", language: "italian", group: "dying" },
  { id: "teneramente", term: "teneramente", meaning: "tenderly (tenerezza: tenderness)", language: "italian", group: "tender" },
  { id: "tosto", term: "tosto", meaning: "swift, rapid", language: "italian", group: "swift" },
  { id: "volante", term: "volante", meaning: "flying, fast", language: "italian", group: "swift" },
  { id: "aber", term: "aber", meaning: "but", language: "german", group: "but" },
  { id: "ausdruck", term: "Ausdruck", meaning: "expression", language: "german", group: "expression" },
  { id: "bewegt", term: "bewegt", meaning: "with movement, agitated", language: "german", group: "movement" },
  { id: "breit", term: "breit", meaning: "broad, expansive", language: "german", group: "broad" },
  { id: "ein", term: "ein, eine", meaning: "a, one", language: "german", group: "one" },
  { id: "einfach", term: "einfach", meaning: "simple", language: "german", group: "simple" },
  { id: "etwas", term: "etwas", meaning: "somewhat, rather", language: "german", group: "somewhat" },
  { id: "frohlich", term: "fröhlich", meaning: "cheerful, joyful", language: "german", group: "cheerful" },
  { id: "immer", term: "immer", meaning: "always", language: "german", group: "always" },
  { id: "langsam", term: "langsam", meaning: "slow", language: "german", group: "slow" },
  { id: "lebhaft", term: "lebhaft", meaning: "lively", language: "german", group: "lively" },
  { id: "massig", term: "mässig", meaning: "at a moderate speed", language: "german", group: "moderate" },
  { id: "mit", term: "mit", meaning: "with", language: "german", group: "with" },
  { id: "nicht", term: "nicht", meaning: "not", language: "german", group: "not" },
  { id: "ohne", term: "ohne", meaning: "without", language: "german", group: "without" },
  { id: "ruhig", term: "ruhig", meaning: "peaceful, calm", language: "german", group: "calm" },
  { id: "schnell", term: "schnell", meaning: "fast", language: "german", group: "fast" },
  { id: "sehr", term: "sehr", meaning: "very", language: "german", group: "very" },
  { id: "suss", term: "süss", meaning: "sweet", language: "german", group: "sweet" },
  { id: "traurig", term: "traurig", meaning: "sad", language: "german", group: "sad" },
  { id: "und", term: "und", meaning: "and", language: "german", group: "and" },
  { id: "voll", term: "voll", meaning: "full", language: "german", group: "full" },
  { id: "wenig", term: "wenig", meaning: "little", language: "german", group: "little" },
  { id: "wieder", term: "wieder", meaning: "again", language: "german", group: "again" },
  { id: "zart", term: "zart", meaning: "tender, delicate", language: "german", group: "tender" },
  { id: "zu", term: "zu", meaning: "to, too", language: "german", group: "to" },
  { id: "una-corda", term: "una corda", meaning: "press the left (soft) pedal (literally “one string”)", language: "direction", group: "left-pedal" },
  { id: "tre-corde", term: "tre corde", meaning: "release the left pedal (literally “three strings”)", language: "direction", group: "release-left" },
  { id: "mano-sinistra", term: "mano sinistra (m.s.)", meaning: "left hand", language: "direction", group: "left-hand" },
  { id: "mano-destra", term: "mano destra (m.d.)", meaning: "right hand", language: "direction", group: "right-hand" },
];

export interface InstrumentG5 {
  id: string;
  name: string;
  /** Orchestral family for the standard orchestra, or "non-orchestral". The harp is a string instrument that is not a member of the string section. */
  family: "strings" | "woodwind" | "brass" | "percussion" | "keyboard" | "non-orchestral";
  /** How the sound is made, in words a learner can compare. */
  sound: "bowed or plucked strings" | "plucked strings" | "single reed" | "double reed" | "air across an edge" | "lips buzzing into a mouthpiece" | "struck" | "keyboard mechanism";
  /** Clefs the instrument normally reads (the reference book states these only for the instruments marked). */
  clefs: Array<"treble" | "bass" | "alto" | "tenor">;
  /** Percussion only: pitched (definite) or not (indefinite). */
  pitch?: "definite" | "indefinite";
  /** The instrument it is a larger or smaller version of, and which way ("piccolo": higher flute). */
  version?: { of: string; register: "higher" | "lower" };
  /** True for the instruments the book lists as new at Grade 5 (those not in the Grade 4 list). */
  newAtGrade5: boolean;
}

export const INSTRUMENTS_G5: InstrumentG5[] = [
  // Grade 4 instruments that Grade 5 questions about reeds and clefs still use
  { id: "flute", name: "flute", family: "woodwind", sound: "air across an edge", clefs: ["treble"], newAtGrade5: false },
  { id: "oboe", name: "oboe", family: "woodwind", sound: "double reed", clefs: ["treble"], newAtGrade5: false },
  { id: "clarinet", name: "clarinet", family: "woodwind", sound: "single reed", clefs: ["treble"], newAtGrade5: false },
  { id: "bassoon", name: "bassoon", family: "woodwind", sound: "double reed", clefs: ["bass", "tenor"], newAtGrade5: false },
  { id: "viola", name: "viola", family: "strings", sound: "bowed or plucked strings", clefs: ["alto"], newAtGrade5: false },
  { id: "cello", name: "cello", family: "strings", sound: "bowed or plucked strings", clefs: ["bass", "tenor"], newAtGrade5: false },
  { id: "trombone-tenor", name: "tenor trombone", family: "brass", sound: "lips buzzing into a mouthpiece", clefs: ["bass", "tenor"], newAtGrade5: false },
  // New at Grade 5 (First Steps Grade 5 section 15)
  { id: "harp", name: "harp", family: "strings", sound: "plucked strings", clefs: ["treble", "bass"], newAtGrade5: true },
  { id: "piccolo", name: "piccolo", family: "woodwind", sound: "air across an edge", clefs: ["treble"], version: { of: "flute", register: "higher" }, newAtGrade5: true },
  { id: "cor-anglais", name: "cor anglais", family: "woodwind", sound: "double reed", clefs: ["treble"], version: { of: "oboe", register: "lower" }, newAtGrade5: true },
  { id: "bass-clarinet", name: "bass clarinet", family: "woodwind", sound: "single reed", clefs: ["treble"], version: { of: "clarinet", register: "lower" }, newAtGrade5: true },
  { id: "double-bassoon", name: "double bassoon", family: "woodwind", sound: "double reed", clefs: ["bass"], version: { of: "bassoon", register: "lower" }, newAtGrade5: true },
  { id: "bass-trombone", name: "bass trombone", family: "brass", sound: "lips buzzing into a mouthpiece", clefs: ["bass"], newAtGrade5: true },
  { id: "triangle", name: "triangle", family: "percussion", sound: "struck", clefs: [], pitch: "indefinite", newAtGrade5: true },
  { id: "tambourine", name: "tambourine", family: "percussion", sound: "struck", clefs: [], pitch: "indefinite", newAtGrade5: true },
  { id: "castanets", name: "castanets", family: "percussion", sound: "struck", clefs: [], pitch: "indefinite", newAtGrade5: true },
  { id: "tam-tam", name: "tam-tam (gong)", family: "percussion", sound: "struck", clefs: [], pitch: "indefinite", newAtGrade5: true },
  { id: "xylophone", name: "xylophone", family: "percussion", sound: "struck", clefs: ["treble"], pitch: "definite", newAtGrade5: true },
  { id: "marimba", name: "marimba", family: "percussion", sound: "struck", clefs: ["treble", "bass"], pitch: "definite", newAtGrade5: true },
  { id: "glockenspiel", name: "glockenspiel", family: "percussion", sound: "struck", clefs: ["treble"], pitch: "definite", newAtGrade5: true },
  { id: "vibraphone", name: "vibraphone", family: "percussion", sound: "struck", clefs: ["treble"], pitch: "definite", newAtGrade5: true },
  { id: "celesta", name: "celesta", family: "percussion", sound: "struck", clefs: ["treble", "bass"], pitch: "definite", newAtGrade5: true },
  { id: "tubular-bells", name: "tubular bells", family: "percussion", sound: "struck", clefs: ["treble"], pitch: "definite", newAtGrade5: true },
  { id: "guitar", name: "guitar", family: "non-orchestral", sound: "plucked strings", clefs: ["treble"], newAtGrade5: true },
  { id: "saxophone", name: "saxophone", family: "non-orchestral", sound: "single reed", clefs: ["treble"], newAtGrade5: true },
  { id: "recorder", name: "recorder", family: "non-orchestral", sound: "air across an edge", clefs: ["treble"], newAtGrade5: true },
  { id: "harpsichord", name: "harpsichord", family: "non-orchestral", sound: "keyboard mechanism", clefs: ["treble", "bass"], newAtGrade5: true },
  { id: "clavichord", name: "clavichord", family: "non-orchestral", sound: "keyboard mechanism", clefs: ["treble", "bass"], newAtGrade5: true },
  { id: "organ", name: "organ", family: "non-orchestral", sound: "keyboard mechanism", clefs: ["treble", "bass"], newAtGrade5: true },
];

/** The singing voices of the reference book (section 15 and, for SATB, section 13), from highest to lowest. */
export interface VoiceG5 {
  id: "soprano" | "mezzo-soprano" | "alto" | "tenor" | "baritone" | "bass";
  name: string;
  /** Position from the highest (1) to the lowest (6). */
  rank: number;
  /** True for the four voices of a choir (SATB). */
  choral: boolean;
  /**
   * Comfortable range for TEACHING ONLY (the book gives none; OPEN_QUESTIONS Q34). Only the two extremes are ever asked: a part that lies
   * wholly above the alto's top note can only be a soprano part, and a part that lies wholly below the tenor's bottom note only a bass.
   */
  range: [string, string];
}
export const VOICES_G5: VoiceG5[] = [
  { id: "soprano", name: "soprano", rank: 1, choral: true, range: ["C4", "A5"] },
  { id: "mezzo-soprano", name: "mezzo-soprano", rank: 2, choral: false, range: ["A3", "F5"] },
  { id: "alto", name: "alto", rank: 3, choral: true, range: ["F3", "D5"] },
  { id: "tenor", name: "tenor", rank: 4, choral: true, range: ["C3", "A4"] },
  { id: "baritone", name: "baritone", rank: 5, choral: false, range: ["A2", "F4"] },
  { id: "bass", name: "bass", rank: 6, choral: true, range: ["E2", "D4"] },
];

/** The Grade 5 vocabulary as one value, for the generation fingerprint of Grade 5 templates. */
export const VOCAB_G5 = { version: VOCAB_G5_VERSION, terms: TERMS_G5, instruments: INSTRUMENTS_G5, voices: VOICES_G5 };
