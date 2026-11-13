import { frag, note } from "@mtp/engine";
import { CL3, FORMS, KEYS_G4, ORN, has, staveC, type Spec2 } from "./lib4.ts";

const ornaments = (clef: "treble" | "bass" | "alto", items: Array<[string, Record<string, unknown>]>, text: string) =>
  frag(clef, [{ events: items.map(([p, extra]) => note(p, "minim", extra)).slice(0, 4), barline: "final" }], text, { showKeySignature: false, timeSignature: "2/2" });
const KEYS_EASY = ["C major", "G major", "D major", "F major"];

export const U5: Spec2[] = [
  {
    node: "G4-U5-L01",
    version: 1,
    bind: [
      { t: "t.g4.ornament-name", c: ["c.ornaments.signs"], scope: { ornaments: ORN } },
      { t: "t.g4.ornament-spot", c: ["c.ornaments.signs"], scope: { ornaments: ORN, keys: KEYS_EASY, clefs: ["treble", "bass"], noteValues: ["crotchet"], timeSignatures: ["3/4"], maxLedgerLines: 2, accidentals: true, keySignatures: true } },
      { t: "t.g4.ornament-facts", c: ["c.ornaments.signs"], scope: { ornaments: ORN } },
      { t: "t.g4.ornament-bar", c: ["c.ornaments.signs"], scope: { ornaments: ORN, keys: KEYS_EASY, clefs: ["treble", "bass"], noteValues: ["crotchet"], timeSignatures: ["2/4", "3/4", "4/4"], maxLedgerLines: 2, accidentals: true, keySignatures: true } },
    ],
    objective: { statement: "Recognise and name the trill, turn, upper and lower mordent, acciaccatura and appoggiatura.", criteria: ["I know the signs that go above a note.", "I know the small notes that go before a note.", "I know ornaments take no time in the bar."] },
    explain: [
      { text: "Composers decorate notes with ornaments. They are written in two ways: by small notes just before the main note, or by special signs above the stave. Neither takes any time in the bar: the time values of the full-size notes add up exactly as if the small notes and signs were not there." },
      { music: ornaments("treble", [["E5", { ornament: "trill" }], ["E5", { ornament: "turn" }], ["E5", { ornament: "upper-mordent" }], ["E5", { ornament: "lower-mordent" }]], "A bar of four minims on E, each with a sign above it: a trill, a turn, an upper mordent and a lower mordent."), caption: "Signs above a note: trill (tr), turn, upper mordent, lower mordent." },
      { text: "The trill is written tr, sometimes followed by a wavy line. The turn is a sideways S-shaped curl. The mordent is a short zig-zag: with no line through it, it is the upper mordent; with a short vertical line through it, it is the lower mordent." },
      { music: ornaments("treble", [["E5", { grace: { kind: "acciaccatura", pitches: ["F5"] } }], ["E5", { grace: { kind: "appoggiatura", pitches: ["F5"] } }]], "A bar of two minims on E: the first with a small crushed note before it, the second with a small note before it."), caption: "Small notes before the main note: acciaccatura (with a stroke), appoggiatura (without)." },
      { text: "A small note with a diagonal stroke through its stem and flag is an acciaccatura (a 'crushed' note). A small note with no stroke is an appoggiatura. At Grade 4 you need to recognise and name all six; how each is played is a Grade 5 topic." },
      { tip: "Signs above: tr = trill, curl = turn, zig-zag = upper mordent, zig-zag with a line = lower mordent. Small notes: stroke = acciaccatura, no stroke = appoggiatura. None counts in the bar." },
    ],
    demo: { widget: "staff", music: ornaments("treble", [["G5", { ornament: "trill" }], ["G5", { ornament: "turn" }]], "A bar of two minims on G, the first with a trill sign, the second with a turn sign."), steps: ["The first note has the letters tr above it: a trill.", "The second has a sideways S above it: a turn.", "Neither sign changes how many beats the note has."], text: "A trill and a turn above two minims." },
    guided: [
      { t: "t.g4.ornament-facts", correct: "Yes: you matched the name to the description." },
      { t: "t.g4.ornament-name", correct: "Right: you recognised the sign." },
      { t: "t.g4.ornament-spot", correct: "Yes: you found the sign in the music." },
    ],
    independent: [
      { t: "t.g4.ornament-name", correct: "Correct name." },
      { t: "t.g4.ornament-spot", correct: "Correct note." },
      { t: "t.g4.ornament-bar", correct: "Correct: small notes take no time." },
      { t: "t.g4.ornament-name", correct: "Correct." },
      { t: "t.g4.ornament-facts", correct: "Correct." },
      { t: "t.g4.ornament-spot", correct: "Correct." },
    ],
    recap: ["Ornaments are signs above a note or small notes before it.", "Signs: trill, turn, upper mordent, lower mordent. Small notes: acciaccatura, appoggiatura.", "None of them counts towards the beats of the bar."],
    review: [{ t: "t.g4.ornament-name", afterDays: 1 }, { t: "t.g4.ornament-spot", afterDays: 3 }, { t: "t.g4.ornament-bar", afterDays: 7 }],
    notes: "Original wording. Follows Grade 4 outcome 17 and First Steps Grade 4 section 13 (pp. 99-100, read in the PDF): the two ways of writing ornaments, the six names, no time in the bar. How the ornaments are played is Grade 5 in the book and is not asked. Notation of the mordent signs: the renderer draws the sign for each ornament name; the descriptions in words are given for accessibility.",
  },
  {
    node: "G4-U5-L02",
    version: 1,
    bind: [
      { t: "t.g4.instruments", c: ["c.instruments.orchestra"], scope: {} },
      { t: "t.g4.instrument-range", c: ["c.instruments.orchestra"], scope: {} },
    ],
    objective: { statement: "Know the four families of the orchestra, their main instruments, their clefs and which play highest and lowest.", criteria: ["I know the strings, woodwind, brass and percussion.", "I know the usual clef of each instrument.", "I know which instrument of a family plays the highest and the lowest notes."] },
    explain: [
      { text: "The orchestra has four groups of instruments: strings, woodwind, brass and percussion. The standard strings are the violin, viola, cello and double bass. The standard woodwind are the flute, oboe, clarinet and bassoon. The standard brass are the trumpet, horn, trombone and tuba." },
      { text: "Within each family the instruments are listed from the one that can play the highest notes to the one that can play the lowest: violin to double bass, flute to bassoon, trumpet to tuba. Smaller instruments play higher." },
      { text: "Each instrument has a clef it normally uses; others may be used if the music goes very high or low. The violin, flute, oboe, clarinet, trumpet and horn normally read the treble clef. The cello, bassoon, trombone, double bass and tuba normally read the bass clef. The viola normally reads the alto clef." },
      { music: staveC("alto", ["C4", "G4", "E4"], "An alto stave with middle C, G and E: a few notes for the viola.", { showKeySignature: false }), caption: "The viola reads the alto clef." },
      { text: "The percussion family includes the timpani (kettle drums), the side drum, the bass drum and the cymbals. Of these, only the timpani produce notes of definite pitch; they are tuned to particular notes, often the tonic and the dominant of the key." },
      { tip: "Four families: strings, woodwind, brass, percussion. Treble clef for the high instruments, bass clef for the low ones, alto clef for the viola. Only the timpani have definite pitch." },
    ],
    demo: { widget: "staff", music: staveC("alto", ["A3", "C4", "E4"], "An alto stave with A, middle C and E.", { showKeySignature: false }), steps: ["This music is written in the alto clef.", "The only instrument that normally reads the alto clef is the viola.", "The viola is a string instrument."], text: "Music in the alto clef, for the viola." },
    guided: [
      { t: "t.g4.instruments", when: has("family"), correct: "Yes: that is its family." },
      { t: "t.g4.instruments", when: has("clef"), correct: "Yes: its normal clef." },
      { t: "t.g4.instrument-range", correct: "Yes: smaller instruments play higher." },
    ],
    independent: [
      { t: "t.g4.instruments", when: has("family"), correct: "Correct family." },
      { t: "t.g4.instrument-range", correct: "Correct." },
      { t: "t.g4.instruments", when: has("clef"), correct: "Correct clef." },
      { t: "t.g4.instrument-range", correct: "Correct." },
      { t: "t.g4.instruments", when: has("belongs"), correct: "Correct." },
      { t: "t.g4.instrument-range", correct: "Correct." },
    ],
    recap: ["Strings, woodwind, brass and percussion are the four families.", "Each family runs from its highest instrument to its lowest.", "Viola: alto clef. Only the timpani have definite pitch."],
    review: [{ t: "t.g4.instruments", afterDays: 1 }, { t: "t.g4.instrument-range", afterDays: 3 }, { t: "t.g4.instruments", afterDays: 7 }],
    notes: "Original wording. Follows Grade 4 outcome 18 and First Steps Grade 4 section 15 (p. 102, read in the PDF): the four groups, the standard instruments of each, highest-to-lowest order, normal clefs and the pitched timpani. The book underlines the clefs an instrument ALWAYS uses; the underlining could not be read reliably from the scan, so the course says 'normally' everywhere (TEACHER TO CONFIRM). Transposing instruments are Grade 5 and are never asked.",
  },
  {
    node: "G4-U5-L03",
    version: 1,
    bind: [
      { t: "t.g4.technique-facts", c: ["c.instruments.techniques"], scope: {} },
      { t: "t.g4.technique-use", c: ["c.instruments.techniques"], scope: {} },
    ],
    objective: { statement: "Understand pizzicato, arco, mutes and the other directions for string and brass players.", criteria: ["I know pizzicato means plucked and arco means with the bow.", "I know con sordino means with the mute and senza sordino without.", "I know what sul G, sul ponticello and the bowing signs ask."] },
    explain: [
      { text: "Composers give string and brass players instructions about how to make the sound. Pizzicato (pizz.) tells string players to pluck the strings with their fingers instead of using the bow. Arco means 'with the bow' and cancels pizzicato." },
      { text: "String and brass instruments may use a mute, a device that softens the sound. Con sordino (con sord.) means 'with the mute'; senza sordino (senza sord.) means 'without the mute'." },
      { text: "String players are also told where to play. Sul G means 'on the G string'. Sul ponticello means 'near the bridge', which gives a thin, glassy sound. Bowing signs show the direction of the bow: the sign shaped like a square bracket open at the bottom (⊓) is a down-bow, and the V shape (∨) is an up-bow. A slur over or under two or more notes means they are played in a single bow-stroke, either up or down." },
      { tip: "pizz. = plucked, arco = bowed. con sord. = muted, senza sord. = unmuted. sul G = on the G string; sul ponticello = near the bridge. ⊓ down-bow, ∨ up-bow." },
    ],
    demo: { widget: "staff", music: staveC("treble", ["G4", "B4", "D5"], "A treble stave with three notes for a violin: G, B and D."), steps: ["If it is marked pizz., the violinist plucks them.", "If it is then marked arco, the bow returns.", "If it is marked con sord., a mute softens the sound."], text: "Three notes for a violin, to be plucked or played with the bow." },
    guided: [
      { t: "t.g4.technique-facts", correct: "Yes: that is the meaning." },
      { t: "t.g4.technique-use", correct: "Right: the direction for that way of playing." },
      { t: "t.g4.technique-facts", correct: "Yes." },
    ],
    independent: [
      { t: "t.g4.technique-facts", correct: "Correct meaning." },
      { t: "t.g4.technique-use", correct: "Correct direction." },
      { t: "t.g4.technique-facts", correct: "Correct." },
      { t: "t.g4.technique-use", correct: "Correct." },
      { t: "t.g4.technique-facts", correct: "Correct." },
      { t: "t.g4.technique-use", correct: "Correct." },
    ],
    recap: ["Pizzicato is plucked; arco is with the bow.", "Con sordino is muted; senza sordino is unmuted.", "Sul G is on the G string; sul ponticello is near the bridge; ⊓ is down-bow and ∨ up-bow."],
    review: [{ t: "t.g4.technique-facts", afterDays: 1 }, { t: "t.g4.technique-use", afterDays: 3 }, { t: "t.g4.technique-facts", afterDays: 7 }],
    notes: "Original wording. Follows Grade 4 outcomes 18 and 16 and First Steps Grade 4 section 15 (p. 102): mutes, pizzicato, arco, bowing signs, slurs as bow-strokes, sul G, sul ponticello. The bowing signs are described in words next to the characters because fonts differ; a teacher should check how the signs appear on learners' screens.",
  },
  {
    node: "G4-U5-L04",
    version: 1,
    bind: [
      { t: "t.g4.terms", c: ["c.terms.g4"], scope: {} },
      { t: "t.g4.term-use", c: ["c.terms.g4"], scope: {} },
    ],
    objective: { statement: "Understand the Grade 4 Italian and French terms.", criteria: ["I know the terms of expression: affettuoso, amabile, appassionato, cantando, facile, con fuoco, nobilmente, sonoro.", "I know the terms for changes of speed and fading: affrettando, calando, morendo, perdendosi, l'istesso tempo.", "I know the words that point back or around: come prima, come sopra, quasi, sopra, sotto voce, niente, tempo giusto, presto possibile."] },
    explain: [
      { text: "Grade 4 adds more Italian words for the way music should sound. Some describe character: affettuoso (tenderly), amabile (in a pleasant, amiable way), appassionato (with passion), cantando (in a singing style), facile (easily), con fuoco (with fire), nobilmente (nobly) and sonoro (with a full, resonant tone)." },
      { text: "Some describe changes: affrettando (hurrying), calando (getting softer and usually slower), morendo (dying away) and perdendosi (fading away until lost). L'istesso tempo means 'at the same speed as before': the beat stays the same even when the time signature changes. Tempo giusto means in strict, exact time, and presto possibile means as fast as possible." },
      { text: "Others are small words that join with others: come prima (as before) and come sopra (as above), quasi (as if, almost like), sopra (above), sotto voce (in an undertone, very softly) and niente (nothing, as in 'fading to nothing')." },
      { tip: "Learn them in three groups: character (affettuoso ... sonoro), change (affrettando, calando, morendo, perdendosi ...), and joining words (come, quasi, sopra, sotto, niente)." },
    ],
    demo: { widget: "staff", music: staveC("treble", ["E5", "D5", "C5"], "A treble stave with three notes going down: E, D, C, for a passage marked morendo."), steps: ["The notes fall away.", "Marked morendo, the music dies away.", "Calando and perdendosi are close cousins: all fade."], text: "A falling phrase, marked morendo." },
    guided: [
      { t: "t.g4.terms", correct: "Yes: that is the meaning." },
      { t: "t.g4.term-use", correct: "Right: the term that fits." },
      { t: "t.g4.terms", correct: "Yes." },
    ],
    independent: [
      { t: "t.g4.terms", correct: "Correct meaning." },
      { t: "t.g4.term-use", correct: "Correct term." },
      { t: "t.g4.terms", correct: "Correct." },
      { t: "t.g4.term-use", correct: "Correct." },
      { t: "t.g4.terms", correct: "Correct." },
      { t: "t.g4.term-use", correct: "Correct." },
    ],
    recap: ["Terms of character: affettuoso, amabile, appassionato, cantando, facile, con fuoco, nobilmente, sonoro.", "Terms of change: affrettando, calando, morendo, perdendosi, l'istesso tempo.", "Joining words: come prima, come sopra, quasi, sopra, sotto voce, niente, tempo giusto, presto possibile."],
    review: [{ t: "t.g4.terms", afterDays: 1 }, { t: "t.g4.term-use", afterDays: 3 }, { t: "t.g4.terms", afterDays: 7 }],
    notes: "Original wording. Follows Grade 4 outcome 16 and First Steps Grade 4 section 15 (p. 103, read in the PDF), which states that its list is the Grade 4 list of the companion workbook. OPEN_QUESTIONS Q2: the official outline does not publish a term list, so these 21 terms are provisional and need teacher confirmation. Terms with (nearly) the same meaning (calando, morendo, perdendosi) are never offered as alternatives to one another and are never asked as 'which term means ...'. Grade 1-3 terms are never asked here, so no earlier-grade fact can earn Grade 4 credit.",
  },
  {
    node: "G4-U5-L05",
    version: 1,
    bind: [
      { t: "t.g4.passage", c: ["c.context.passage-g4"], scope: { keys: KEYS_G4, clefs: CL3, ornaments: ORN, noteValues: ["crotchet"], timeSignatures: ["3/4"], maxLedgerLines: 2, accidentals: true, keySignatures: true, minorForms: FORMS, intervalQuality: "number-and-quality", intervalLowerNote: "any-diatonic" } },
      { t: "t.g4.passage-directions", c: ["c.context.passage-g4"], scope: { keys: KEYS_G4, clefs: CL3, ornaments: ORN, noteValues: ["crotchet"], timeSignatures: ["3/4"], maxLedgerLines: 2, accidentals: true, keySignatures: true, minorForms: FORMS } },
    ],
    objective: { statement: "Answer questions about intervals, ornaments, directions and instruments in a short passage.", criteria: ["I read the clef, key signature and directions first.", "I answer each question with the right rule.", "I use what I know of the instrument named in the question."] },
    explain: [
      { text: "In the examination, music theory questions often come together in a short piece of music. A single passage may ask about intervals, ornaments, performance directions and the instrument it is written for. Each question uses something you already know; the skill is knowing where to look." },
      { music: frag("alto", [{ events: [note("D4", "crotchet"), note("F4", "crotchet", { ornament: "trill", label: "A" }), note("A3", "crotchet")], barline: "final" }], "An alto stave in D minor, 3/4, marked affettuoso: D, F with a trill sign (marked A), then A below.", { key: "D minor", showKeySignature: true, timeSignature: "3/4", tempoText: "Affettuoso" }), caption: "A passage for the viola: alto clef, D minor, marked affettuoso, with a trill on the note marked A." },
      { text: "Method: (1) look at the clef and the key signature: here the alto clef, one flat, D minor. (2) Read the words above the stave: affettuoso, tenderly. (3) Check each sign on the notes: the trill. (4) Think about the instrument: the viola is a string instrument that normally reads the alto clef. Then answer each question on its own, one rule at a time." },
      { tip: "Clef, key, words, signs, instrument. Answer each question with the rule that belongs to it." },
    ],
    demo: { widget: "staff", music: frag("alto", [{ events: [note("D4", "crotchet"), note("F4", "crotchet", { ornament: "trill", label: "A" }), note("A3", "crotchet")], barline: "final" }], "An alto stave in D minor, 3/4, marked affettuoso, with a trill on the second note.", { key: "D minor", showKeySignature: true, timeSignature: "3/4", tempoText: "Affettuoso" }), steps: ["Alto clef: the viola's clef.", "Affettuoso: tenderly.", "The sign above the note marked A is a trill."], text: "A short passage for the viola in D minor, marked affettuoso, with a trill." },
    guided: [
      { t: "t.g4.passage", correct: "Yes: each question used a different rule." },
      { t: "t.g4.passage-directions", correct: "Right: the directions and the sign." },
      { t: "t.g4.passage", correct: "Yes." },
    ],
    independent: [
      { t: "t.g4.passage", correct: "Correct." },
      { t: "t.g4.passage-directions", correct: "Correct." },
      { t: "t.g4.passage", correct: "Correct." },
      { t: "t.g4.passage-directions", correct: "Correct." },
      { t: "t.g4.passage", correct: "Correct." },
      { t: "t.g4.passage-directions", correct: "Correct." },
    ],
    recap: ["Look at the clef, key signature and printed directions first.", "Answer each question with the rule that belongs to it.", "Use what you know about the instrument named."],
    review: [{ t: "t.g4.passage", afterDays: 1 }, { t: "t.g4.passage-directions", afterDays: 3 }, { t: "t.g4.passage", afterDays: 7 }],
    notes: "Original wording and original passages (the book has no passage for this unit; section 15 'General Questions' is the model). The passages are generated, short, written for a named orchestral instrument and combine an instrument question with an interval, an ornament or a performance direction. Every passage carries a question about the instrument, so it is always evidence for the orchestra outcome; the interval, ornament and term parts are counted only by their own templates elsewhere.",
  },
];
void has;
