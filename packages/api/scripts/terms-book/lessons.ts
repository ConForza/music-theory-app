/**
 * Teaching copy for the eleven terminology lessons (hand-written; the questions are picked from the generators and frozen by the
 * authoring script). All wording is original. Learner-facing text never mentions the reference book or an exam board.
 *
 * A lesson only uses words it has taught, or earlier lessons taught: the explanation of lesson k never names a term first taught
 * in lesson k+1 (a test reads every lesson and checks it).
 */
export interface LessonCopy {
  node: string;
  objective: string;
  criteria: [string, string, string];
  intro: string;
  /** After the one-sentence meanings of each term. */
  usage?: string;
  /** A closing explanation block (optional). */
  extra?: string;
  tip: string;
  /** The melody's tempo text, and the caption of what to notice. */
  demo: { tempo: string; steps: [string, string, string]; text: string };
  /** A second notation example in the explanation (every lesson shows notation). `tempo` is empty for the touch-signs lesson, whose example draws a pointed accent. */
  example: { tempo: string; caption: string; text: string };
  recap: [string, string, string];
  notes: string;
}

const NOTES = (grade: number, more = "") => `Original wording. The terms are the reference list printed for Grade ${grade} (OPEN_QUESTIONS Q2: no authoritative list is published, so a qualified teacher must approve the list and its grade placement, Q38).${more ? ` ${more}` : ""}`;

export const COPY: LessonCopy[] = [
  {
    node: "G2-U5-L05",
    objective: "Learn seven small Italian words that join with other words to make a direction.",
    criteria: ["I know a and alla can mean “in the style of”, and con means with.", "I know e means and, ma means but, non means not and senza means without.", "I can work out a short direction such as alla marcia."],
    intro: "Many directions are built from small Italian helper words. On their own they do not say how fast or how loudly to play: they join other words together. You will meet these seven again and again.",
    usage: "Helper words build directions. Alla marcia means in the style of a march. A tempo means go back to the speed from before. When you see a helper word, read the whole direction one word at a time.",
    tip: "con = with and senza = without are opposites. e = and, ma = but, non = not. a and alla both point to a style or manner.",
    demo: { tempo: "alla marcia", steps: ["Look at the words above the first bar: alla marcia.", "Alla means in the style of, and marcia means march, so the player should sound like a march.", "The words do not change the notes. They change the way the notes are played."], text: "A two-bar melody in G major marked alla marcia." },
    example: { tempo: "a tempo", caption: "The words a tempo above a bar: go back to the speed from before.", text: "A two-bar melody in G major marked a tempo." },
    recap: ["A, alla, con, e, ma, non and senza are small helper words.", "Con means with and senza means without; e means and, ma means but, non means not.", "Read a direction one word at a time."],
    notes: NOTES(2, "Phrases are limited to words taught by this lesson or earlier."),
  },
  {
    node: "G2-U5-L06",
    objective: "Learn words that say how much: more, less, very and too much, and the word for movement.",
    criteria: ["I know più means more and meno means less.", "I know molto and assai both mean very, and troppo means too much.", "I can read directions such as meno mosso and ma non troppo."],
    intro: "These words change how much of something a direction asks for. Più and meno are opposites. Molto and assai both strengthen a word. Troppo warns against too much. Mosso means movement, and it is the word that più and meno most often meet.",
    usage: "Più mosso means with more movement, so a little faster; meno mosso means with less movement, so slower. Non troppo means not too much, and ma non troppo means but not too much. Molto vivace means very lively, and allegro assai means very quick.",
    tip: "più = more, meno = less. molto = assai = very. troppo = too much, so non troppo = not too much.",
    demo: { tempo: "meno mosso", steps: ["Look at the words above the first bar: meno mosso.", "Meno means less and mosso means movement, so the music should move less: a little slower.", "The words ask for a change of feeling, not a new tune."], text: "A two-bar melody in G major marked meno mosso." },
    example: { tempo: "molto vivace", caption: "Molto vivace: very lively. Molto strengthens vivace.", text: "A two-bar melody in G major marked molto vivace." },
    recap: ["Più means more and meno means less.", "Molto and assai mean very; troppo means too much.", "Mosso means movement: più mosso is faster, meno mosso is slower."],
    notes: NOTES(2, "“Più mosso” is a standard direction not printed in the list; it is the opposite of the printed “meno mosso”, and it is flagged for the teacher."),
  },
  {
    node: "G2-U5-L07",
    objective: "Learn six more words of speed and character: allargando, grave, larghetto, giocoso, simile and vivo.",
    criteria: ["I can put grave, largo and larghetto in order from slowest to fastest.", "I know allargando means broadening, and vivo means lively and quick.", "I know giocoso means playful and simile means carry on in the same way."],
    intro: "Here are six more words. Grave, larghetto and allargando are about slow, broad music. Vivo is quick, like vivace. Giocoso describes a playful mood, and simile tells the player to carry on in the same way.",
    usage: "From slowest to fastest the slow words go grave, largo, larghetto. Allargando is different: it is a change, getting a little slower and broader, usually with a little more sound.",
    tip: "Slow: grave (very slow, solemn), largo (slow, stately), larghetto (rather slow). Changing: allargando (broadening). Quick: vivo. Mood: giocoso (playful). Carry on: simile.",
    demo: { tempo: "larghetto", steps: ["Look at the word above the first bar: larghetto.", "It ends in -etto, which means a little: a little largo, so rather slow, but not as slow as largo.", "Play it gently and broadly, but keep it moving."], text: "A two-bar melody in G major marked larghetto." },
    example: { tempo: "grave", caption: "Grave above the first bar: very slow and solemn, slower than largo.", text: "A two-bar melody in G major marked grave." },
    recap: ["Grave is slower than largo, and largo is slower than larghetto.", "Allargando means broadening: getting a little slower, and usually louder.", "Vivo is lively and quick, giocoso is playful and simile means in the same way."],
    notes: NOTES(2),
  },
  {
    node: "G2-U5-L08",
    objective: "Recognise three more signs that show how to touch a note: the wedge, the pointed accent and dots under a slur.",
    criteria: ["I know a wedge means staccatissimo: as short as possible.", "I know ∧ over a note, or ∨ under it, is a pointed accent: stronger than >.", "I know dots under a slur mean the notes are only slightly separated."],
    intro: "Some signs tell the player how to touch one note. You already know the dot (staccato, short), the sideways V (accent) and the short line (tenuto, held). Here are three more.",
    usage: "A small wedge means staccatissimo: the note is as short as possible, and perhaps accented too. A pointed accent is written ∧ over a note or ∨ under it, and means an accent as strong as, or stronger than, >.",
    extra: "Dots under a slur mean semi-staccato: the notes are slightly separated, but not as much as with ordinary staccato dots.",
    tip: "Dot = short. Wedge = shortest. Dots under a slur = slightly separated. > is an accent and ∧ or ∨ is a stronger one. The short line is tenuto: held.",
    demo: { tempo: "", steps: ["Look at the second note: it has a small wedge.", "A wedge means staccatissimo: play it as short as you possibly can.", "Compare it with an ordinary dot, which is short but not as short."], text: "Four crotchets in G major: the second note carries a staccatissimo wedge." },
    example: { tempo: "", caption: "The first note has a pointed accent (∧): play it with a strong stress, stronger than >.", text: "Four crotchets in G major: the first note carries a pointed accent." },
    recap: ["The wedge is staccatissimo: as short as possible.", "∧ over a note or ∨ under it is a pointed accent: stronger than >.", "Dots under a slur mean semi-staccato: slightly separated."],
    notes: NOTES(2, "Signs are drawn by the notation engine. Staccatissimo existed in the vocabulary but was never taught; the Grade 2 touch-signs lesson already named it in its objective."),
  },
  {
    node: "G3-U5-L05",
    objective: "Learn six words about speed and time: adagietto, largamente, stringendo, alla breve, comodo and rubato.",
    criteria: ["I know adagietto is rather slow, a little faster than adagio.", "I know stringendo means gradually faster and alla breve means two minim beats in a bar.", "I know comodo means comfortable and rubato means with some freedom of time."],
    intro: "These six words are about speed and time. Adagietto, largamente and comodo describe how fast or how broad the music is. Stringendo is a change of speed. Alla breve is a sign for a way of counting. Rubato lets the player bend the time.",
    usage: "Adagietto is rather slow, but a little faster than adagio. Largamente means broadly. Stringendo means gradually getting faster, pressing on. Tempo comodo means at a comfortable speed. Tempo rubato means with some freedom of time, so the player may push and pull the beat for expression.",
    extra: "Alla breve is written as a C with a vertical line through it (¢). It means two minim beats in a bar, so the music usually feels quicker than the notes look.",
    tip: "Slow-ish: adagietto, largamente. Easy speed: comodo. Faster and faster: stringendo. Two minim beats: alla breve. Free time: rubato.",
    demo: { tempo: "adagietto", steps: ["Look at the word above the first bar: adagietto.", "It is a little adagio, so slow, but a little faster than adagio itself.", "It describes the speed only: the notes are unchanged."], text: "A two-bar melody in G major marked adagietto." },
    example: { tempo: "stringendo", caption: "Stringendo above a bar: get gradually faster, pressing on.", text: "A two-bar melody in G major marked stringendo." },
    recap: ["Adagietto is rather slow; largamente is broad; comodo is comfortable.", "Stringendo gets gradually faster; alla breve is two minim beats in a bar.", "Rubato means with some freedom of time."],
    notes: NOTES(3, "Alla breve is also the cut-time sign met in the Grade 2 time-signature lessons."),
  },
  {
    node: "G3-U5-L06",
    objective: "Learn six strong words: forza, deciso, risoluto, pesante, marcato and energico.",
    criteria: ["I know forza means force and pesante means heavy.", "I know deciso and risoluto both mean decided and bold.", "I know marcato means emphatic and accented, and energico means energetic."],
    intro: "Six words ask for strength. Forza is force. Deciso and risoluto are about being firm and bold. Pesante is heavy. Energico is full of energy. Marcato is about touch: every note is marked out clearly.",
    usage: "Deciso means with determination and risoluto means bold, strong and resolute: they are close in meaning. Marcato (marc.) means emphatic and accented.",
    tip: "Force: forza. Firm and bold: deciso, risoluto. Heavy: pesante. Full of energy: energico. Every note stressed: marcato.",
    demo: { tempo: "risoluto", steps: ["Look at the word above the first bar: risoluto.", "It means bold, strong and resolute: play with firm confidence.", "It does not change the speed: only the way the notes are shaped."], text: "A two-bar melody in G major marked risoluto." },
    example: { tempo: "pesante", caption: "Pesante above the first bar: heavy, with weight in every note.", text: "A two-bar melody in G major marked pesante." },
    recap: ["Forza is force and pesante is heavy.", "Deciso and risoluto both mean firm and bold; energico is energetic.", "Marcato means emphatic and accented."],
    notes: NOTES(3),
  },
  {
    node: "G3-U5-L07",
    objective: "Learn four gentle words, and two words that say how much: delicato, leggiero, tranquillo, semplice, ben and tanto.",
    criteria: ["I know delicato is delicate and leggiero is light and nimble.", "I know tranquillo means calm and semplice means simple and plain.", "I know ben means well and tanto means so much, as in ben marcato and non tanto."],
    intro: "The first four words ask for gentle playing. Delicato is delicate, leggiero is light and nimble, tranquillo is calm and semplice is simple and plain. Ben and tanto are small words that join with another word.",
    usage: "Ben means well, so ben marcato means well marked: clearly emphasised. Tanto means so much, so non tanto means not so much.",
    tip: "Gentle: delicato, leggiero, tranquillo, semplice. Small words: ben = well, tanto = so much.",
    demo: { tempo: "tranquillo", steps: ["Look at the word above the first bar: tranquillo.", "It means calm: play peacefully, without fuss.", "It describes the mood, not the speed."], text: "A two-bar melody in G major marked tranquillo." },
    example: { tempo: "non tanto", caption: "Non tanto: not so much. It softens the word it belongs with.", text: "A two-bar melody in G major marked non tanto." },
    recap: ["Delicato is delicate and leggiero is light and nimble.", "Tranquillo is calm and semplice is simple and plain.", "Ben means well and tanto means so much."],
    notes: NOTES(3),
  },
  {
    node: "G3-U5-L08",
    objective: "Learn six words of feeling: agitato, mesto, triste, amore, anima and animato.",
    criteria: ["I know agitato is agitated and animato is animated and lively.", "I know mesto and triste are both sad.", "I know amore means love and anima means soul or spirit, as in con anima."],
    intro: "Composers use words of feeling to show the mood of the music. Agitato is restless. Mesto and triste are both sad. Amore is love. Anima is soul or spirit. Animato is animated and lively.",
    usage: "Amoroso means loving. Con anima means with feeling, or spirited. Animando means becoming more lively. Triste may also be written tristamente.",
    tip: "Restless: agitato. Sad: mesto, triste. Love: amore. Soul or spirit: anima. Lively: animato.",
    demo: { tempo: "agitato", steps: ["Look at the word above the first bar: agitato.", "It means agitated: restless and unsettled.", "It describes the mood. Play with energy and a feeling of unrest."], text: "A two-bar melody in G major marked agitato." },
    example: { tempo: "con anima", caption: "Con anima above the first bar: with feeling, or spirited.", text: "A two-bar melody in G major marked con anima." },
    recap: ["Agitato is restless; animato is lively.", "Mesto and triste are both sad.", "Amore is love; anima is soul or spirit."],
    notes: NOTES(3),
  },
  {
    node: "G3-U5-L09",
    objective: "Learn four words of style: marziale, scherzando, brio and ritmico.",
    criteria: ["I know marziale means in a military style.", "I know scherzando means playful and joking.", "I know brio means vigour, as in con brio, and ritmico means with a bold, clear beat."],
    intro: "These four words describe the style of a piece. Marziale is military, like a march. Scherzando is playful, like a joke. Brio is vigour and spirit. Ritmico means the rhythm should be clear and bold.",
    usage: "Con brio means with vigour: lively and spirited. Scherzando may also be written scherzoso.",
    tip: "March: marziale. Joking: scherzando. Spirit: brio. Clear beat: ritmico.",
    demo: { tempo: "marziale", steps: ["Look at the word above the first bar: marziale.", "It means in a military style: steady, upright and firm, like a march.", "It describes the style. The notes stay the same."], text: "A two-bar melody in G major marked marziale." },
    example: { tempo: "con brio", caption: "Con brio above the first bar: with vigour, lively and spirited.", text: "A two-bar melody in G major marked con brio." },
    recap: ["Marziale is military; scherzando is playful and joking.", "Brio is vigour: con brio means with vigour.", "Ritmico asks for a bold, clear beat."],
    notes: NOTES(3),
  },
  {
    node: "G3-U5-L10",
    objective: "Learn six more words: sempre, subito, prima, seconda, volta and ad libitum.",
    criteria: ["I know sempre means always and subito means suddenly.", "I know prima and seconda mean first and second, and volta means time, as in prima volta.", "I know ad libitum means at the player's choice."],
    intro: "These six words are small helpers again. Sempre is always and subito is suddenly: they join other words, as in sempre staccato and subito piano. Prima, seconda and volta put the repeats in order. Ad libitum gives the player a choice.",
    usage: "Prima volta means the first time and seconda volta means the second time: they are written over the endings of a repeated passage. Sempre staccato means always short and detached. Subito piano means suddenly quiet. Ad lib. means the passage may be played freely.",
    tip: "Always: sempre. Suddenly: subito. First, second, time: prima, seconda, volta. At your choice: ad libitum.",
    demo: { tempo: "subito piano", steps: ["Look at the words above the first bar: subito piano.", "Subito means suddenly and piano means quiet, so drop to a quiet sound at once.", "The word subito is about when the change happens: straight away."], text: "A two-bar melody in G major marked subito piano." },
    example: { tempo: "sempre staccato", caption: "Sempre staccato: always short and detached, from the first note to the last.", text: "A two-bar melody in G major marked sempre staccato." },
    recap: ["Sempre means always and subito means suddenly.", "Prima volta is the first time and seconda volta is the second time.", "Ad libitum means at the player's choice."],
    notes: NOTES(3),
  },
  {
    node: "G4-U5-L06",
    objective: "Learn two more Grade 4 words: veloce and voce.",
    criteria: ["I know veloce means swift.", "I know voce means voice.", "I can explain sotto voce as in an undertone."],
    intro: "Two more Italian words complete the Grade 4 list: one is about speed, and the other is the word for the voice, which you already know from sotto voce.",
    usage: "Sotto voce means in an undertone: very softly, as if in a low voice. Veloce asks for quick, light playing.",
    tip: "Veloce = swift. Voce = voice, as in sotto voce.",
    demo: { tempo: "veloce", steps: ["Look at the word above the first bar: veloce.", "It means swift: quick, light and rushing.", "It describes the speed. The notes stay the same."], text: "A two-bar melody in G major marked veloce." },
    example: { tempo: "sotto voce", caption: "Sotto voce above the first bar: in an undertone, as if in a low voice.", text: "A two-bar melody in G major marked sotto voce." },
    recap: ["Veloce means swift.", "Voce means voice.", "Sotto voce means in an undertone."],
    notes: NOTES(4),
  },
];
