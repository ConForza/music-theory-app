<!-- GENERATED FILE — do not edit by hand. Source: content/source-book/terminology-inventory.json, terminology-baseline.json and the committed content, via packages/api/scripts/terminology-docs.ts. Regenerate with `npm run docs:terms -w @mtp/api`. -->

# Terminology coverage, Grades 1-4: the reference book against the course

**Status: development-complete, teacher sign-off pending.** Nothing here is approved for public educational release or endorsed by ABRSM. The reference book's term lists come from a 1999 companion workbook; they are **not** treated as the current official requirement, and its grade placement is **not** treated as official (OPEN_QUESTIONS Q2, Q38). Every placement below that differs from the book, and every term the course teaches that the book does not list, is a teacher decision.

The comparison is generated from the committed lessons, templates, path and blueprints, not from a hand-kept table. *Taught* means a lesson's explanation names the term or one of its questions asks it. *Practised* means a practice or review node (inside the ten-question cap of a practice run) is bound to a template that can ask it as the right answer. *Assessed* means a unit challenge or grade assessment section lists such a template inside what has been taught by that node. Practised and assessed are measured by running the real generators over 260 seeds.

## 1. Verification of the reviewer's counts

The Grade 5 educational review reported Grade 1 32/32, Grade 2 16/31, Grade 3 1/34 and Grade 4 21/22. Re-counted against the book and the tree before this work (PR #13 head):

| List | Reviewer reported | Covered here (a vocabulary entry exists, or a lesson names the term) | Vocabulary entry exists | Reading |
|---|---|---|---|---|
| Grade 1 Italian words | 32/32 | 28/28 | 26/28 | Complete. The reviewer's total of 32 is not reproducible under any single counting convention (the printed list has 28 words and ten signs); the conclusion (complete) agrees. |
| Grade 2 Italian words | 16/31 | 16/30 | 11/30 | Reproduced: 16 covered. The reviewer's 31 counts *mosso* and *moto* separately; the printed line is one entry. Only 11 are real vocabulary entries; four more are named only in a lesson of another grade. |
| Grade 3 Italian words | 1/34 | 2/34 | 0/34 | Reproduced within one entry: the two covered entries are *alla breve* (named in a Grade 2 time-signature lesson) and *prima/primo* (met inside *tempo primo*). No Grade 3 book word was a vocabulary entry. |
| Grade 4 Italian words | 21/22 | 21/22 | 20/22 | Reproduced exactly: *veloce* was missing and *voce* was met only inside *sotto voce*. |

*Counting convention.* One entry per printed headword line; alternative spellings and abbreviations on one line are forms of one entry; each printed sign is one entry; Italian words, French words, techniques and ornaments are counted separately (content/source-book/terminology-inventory.json).

## 2. Before and after

Missing = in no vocabulary and in no lesson. Vocabulary only = a vocabulary entry no lesson teaches. Taught only = taught, but no practice or review can ask it. After this work no entry is in any of the first three states.

| List | Entries | | Missing | Vocabulary only | Taught only | Practised | Assessed |
|---|---|---|---|---|---|---|---|
| Grade 1 Italian words | 28 | before | 0 | 0 | 0 | 0 | 28 |
| | | **after** | **0** | **0** | **0** | **0** | **28** |
| Grade 1 signs | 10 | before | 0 | 0 | 0 | 0 | 10 |
| | | **after** | **0** | **0** | **0** | **0** | **10** |
| Grade 2 Italian words | 30 | before | 14 | 0 | 4 | 0 | 12 |
| | | **after** | **0** | **0** | **0** | **0** | **30** |
| Grade 2 signs | 5 | before | 2 | 1 | 0 | 0 | 2 |
| | | **after** | **0** | **0** | **0** | **0** | **5** |
| Grade 3 Italian words | 34 | before | 32 | 0 | 2 | 0 | 0 |
| | | **after** | **0** | **0** | **0** | **0** | **34** |
| Grade 4 Italian words | 22 | before | 1 | 0 | 0 | 0 | 21 |
| | | **after** | **0** | **0** | **0** | **0** | **22** |
| Grade 4 French words (taught at Grade 5) | 24 | before | 0 | 0 | 0 | 0 | 24 |
| | | **after** | **0** | **0** | **0** | **0** | **24** |
| Grade 4 playing techniques and bowing signs | 8 | before | 0 | 0 | 0 | 0 | 8 |
| | | **after** | **0** | **0** | **0** | **0** | **8** |
| Grade 4 ornament signs | 6 | before | 0 | 0 | 0 | 0 | 6 |
| | | **after** | **0** | **0** | **0** | **0** | **6** |
| **All entries** | 167 | before | 49 | 1 | 6 | 0 | 111 |
| | | **after** | **0** | **0** | **0** | **0** | **167** |

Entries both taught and askable in practice or review: 111 of 167 before, 167 of 167 after.

## 3. Entries that were missing, present but not taught, or taught but not practised

**Missing entirely (49):** Grade 2: *a*, *allargando*, *assai*, *con, col*, *e, ed*, *giocoso*, *grave*, *larghetto*, *ma*, *meno*, *molto*, *non*, *più*, *simile (sim.)*, *pointed accent ∧ (over) or ∨ (under)*, *dots inside a slur (semi-staccato)*. Grade 3: *adagietto*, *ad libitum (ad lib.)*, *agitato*, *amore*, *anima*, *animato*, *ben*, *brio*, *comodo*, *deciso*, *delicato*, *energico*, *forza*, *largamente*, *leggiero*, *marcato (marc.)*, *marziale*, *mesto*, *pesante*, *risoluto*, *ritmico*, *rubato (tempo rubato)*, *scherzando (scherzoso)*, *semplice*, *seconda, secondo*, *sempre*, *stringendo*, *subito*, *tanto*, *tranquillo*, *triste (tristamente)*, *volta*. Grade 4: *veloce*.

**Present but not taught (1):** *wedge (staccatissimo)* (The term existed (vocabulary firstGrade 4) but no lesson taught the wedge at Grade 2, although the G2-U5-L03 objective named it.).

**Taught but not practised (6):** *al, alla*, *mosso, moto*, *senza*, *troppo*, *alla breve*, *prima, primo*. These had no vocabulary entry: a lesson of another grade named them (for example *alla breve* as the cut-time sign), but no question could ask them.

**Present, taught and assessed before, but at a different grade from the book** are listed in section 5.

## 4. What was built

| Lesson | Grade | Teaches | Concept |
|---|---|---|---|
| `G2-U5-L05` Little words that change a direction | 2 | a; al, alla; con, col; e, ed; ma; non; senza | `c.terms.g2-link` |
| `G2-U5-L06` More, less, very and too much | 2 | più; meno; molto; troppo; assai; mosso, moto | `c.terms.g2-more` |
| `G2-U5-L07` More tempo and character words | 2 | allargando; grave; larghetto; giocoso; simile (sim.); vivo | `c.terms.g2-character` |
| `G2-U5-L08` Wedge, pointed accent and dots under a slur | 2 | staccatissimo (the wedge sign); the sign ∧ (over a note) or ∨ (under it); dots under a slur | `c.terms.g2-touch` |
| `G3-U5-L05` Speed and time | 3 | adagietto; largamente; stringendo; alla breve; comodo; rubato | `c.terms.g3-speed` |
| `G3-U5-L06` Strong words | 3 | forza; deciso; risoluto; pesante; marcato (marc.); energico | `c.terms.g3-strong` |
| `G3-U5-L07` Gentle words, and how much | 3 | delicato; leggiero; tranquillo; semplice; ben; tanto | `c.terms.g3-gentle` |
| `G3-U5-L08` Feelings | 3 | agitato; mesto; triste; amore; anima; animato | `c.terms.g3-feelings` |
| `G3-U5-L09` Style and character | 3 | marziale; scherzando; brio; ritmico | `c.terms.g3-style` |
| `G3-U5-L10` Always, suddenly and in order | 3 | sempre; subito; prima, primo; seconda, secondo; volta; ad libitum (ad lib.) | `c.terms.g3-order` |
| `G4-U5-L06` Two more Grade 4 words | 4 | veloce; voce | `c.terms.g4-more` |

57 new vocabulary entries (`VOCAB_BOOK` version 1: 21 for Grade 2, 34 for Grade 3, 2 for Grade 4) plus the older term *staccatissimo*, taught for the first time. Six new templates (`t.g2.book-terms`, `t.g2.book-use`, and the same for Grades 3 and 4), eleven new concepts with `termIds` boundaries, eleven lessons inserted after each grade's existing terms lesson (one unbroken chain), the new templates appended to every practice, review and blueprint section that already revised the grade's terms (item counts unchanged, so no pass mark moved), and the unit challenge, grade assessment and review nodes of the grade and the next one.

Order and safety:

* Each lesson's questions draw their wrong options only from older terms or from this lesson and the ones before it, so a question never shows a word the learner has not been taught.
* A learner who finished a grade before these lessons existed keeps every completion and finds the new lessons waiting. A `*.book-*` template is not offered to them in a practice, review, challenge or assessment run until every lesson that teaches it is completed (`NodeRunService.taughtToLearner`).
* No existing template, concept, lesson file, question fingerprint or blueprint item count changed (pinned by `packages/api/test/terminology-course.test.ts` against fixtures taken from the tree before this work).

## 5. Grade placement for teacher approval (Q38)

The book's grade is where the 1999 list prints a term. This course teaches each new term at the grade where the book prints it, because the course's units follow the book's sections, **not** because that grade is an ABRSM requirement. Where an entry was already taught at a different grade, nothing was moved:

| Term | Book grade | Course teaches it at | Decision needed |
|---|---|---|---|
| *andantino* (word) | 2 | Grade 3 (G3-U5-L03), later than the book | Keep, or move to the book's grade? |
| *dolce* (word) | 2 | Grade 1 (G1-U7-L03), earlier than the book | Keep, or move to the book's grade? |
| *espressivo (espress., espr.)* (word) | 2 | Grade 3 (G3-U5-L03), later than the book | Keep, or move to the book's grade? |
| *sostenuto* (word) | 2 | Grade 3 (G3-U5-L03), later than the book | Keep, or move to the book's grade? |
| *accent sign > over or under a note* (sign) | 2 | Grade 1 (G1-U7-L04), earlier than the book | Keep, or move to the book's grade? |
| *pointed accent ∧ (over) or ∨ (under)* (sign) | 2 | Grade 1 (G1-U1-L04), earlier than the book | Keep, or move to the book's grade? |
| *dots inside a slur (semi-staccato)* (sign) | 2 | Grade 1 (G1-U3-L05), earlier than the book | Keep, or move to the book's grade? |
| *alla breve* (word) | 3 | Grade 2 (G2-U1-L01), earlier than the book | Keep, or move to the book's grade? |
| *come* (word) | 4 | Grade 1 (G1-U3-L01), earlier than the book | Keep, or move to the book's grade? |
| *animé* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *assez* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *avec* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *cédez* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *douce* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *en dehors* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *légèrement* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *lent* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *mais* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *moins* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *modéré* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *presser* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *ralentir* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *retenu* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *sans* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *très* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |
| *vite* (word, French) | 4 | Grade 5 (G5-U5-L06), later than the book | Keep, or move to the book's grade? |

**Course terms that the book does not list in Grades 1-4 (4):** *prestissimo*, *tempo primo*, *con moto*, *tie*. They are kept (removing one would change stored question identities); a teacher decides whether they stay.

**Not changed, on purpose:** the French list is printed with the Grade 4 words in the book and taught at Grade 5 (where the Grade 5 papers test it); the book prints *légèrement* where the course teaches *léger*; *staccatissimo* was a Grade 4 vocabulary entry that no lesson taught, and is now taught with the other touch signs at Grade 2; *più mosso* is a standard direction that the book does not print, used as the opposite of the printed *meno mosso*. Editing `VOCAB_G5` or the older lists would version the Grade 4 and 5 question identities, so each is a teacher decision first.

## 6. The new terms and signs, for teacher review

Every meaning, character description and phrase gloss is newly written and provisional. *Phrases* are the short directions the questions use; every word of each is taught by its lesson or an earlier one.

| Term | Lesson | Meaning | Phrases | Described as (for the “a composer wants …” question) |
|---|---|---|---|---|
| *a* | `G2-U5-L05` | at, to, by or in the style of | a tempo: go back to the speed from before | — |
| *al, alla* | `G2-U5-L05` | to the, or in the manner of | alla marcia: in the style of a march | — |
| *con, col* | `G2-U5-L05` | with | — | — |
| *e, ed* | `G2-U5-L05` | and | — | — |
| *ma* | `G2-U5-L05` | but | — | — |
| *non* | `G2-U5-L05` | not | — | — |
| *senza* | `G2-U5-L05` | without | — | — |
| *più* | `G2-U5-L06` | more | più mosso: with more movement: faster | — |
| *meno* | `G2-U5-L06` | less | meno mosso: with less movement: slower | — |
| *molto* | `G2-U5-L06` | very, or much | molto vivace: very lively | — |
| *troppo* | `G2-U5-L06` | too much | non troppo: not too much; ma non troppo: but not too much | — |
| *assai* | `G2-U5-L06` | very | allegro assai: very quick | — |
| *mosso, moto* | `G2-U5-L06` | movement | — | — |
| *allargando* | `G2-U5-L07` | broadening: getting a little slower, and usually a little louder | — | a grand last chord that slows and broadens as it arrives |
| *grave* | `G2-U5-L07` | very slow and solemn | — | a very slow, solemn procession |
| *larghetto* | `G2-U5-L07` | rather slow, but not as slow as largo | — | a gentle song that is slowish, though not as slow as a largo |
| *giocoso* | `G2-U5-L07` | playful and merry | — | a playful, merry game of tag |
| *simile (sim.)* | `G2-U5-L07` | in the same way: carry on as before | — | the pattern to carry on being played in the same way as it began |
| *vivo* | `G2-U5-L07` | lively and quick | — | a quick, bright dance |
| *the sign ∧ (over a note) or ∨ (under it)* | `G2-U5-L08` | an accent: the note is stressed, as with >, and perhaps even more strongly | — | a note that must be hit hard and clearly |
| *dots under a slur* | `G2-U5-L08` | the notes are slightly separated, but less than with ordinary staccato | — | a flowing line whose notes are only slightly separated |
| *adagietto* | `G3-U5-L05` | rather slow, but a little faster than adagio | — | a tender song that is slow, but not as slow as an adagio |
| *largamente* | `G3-U5-L05` | broadly | — | a broad, sweeping tune with a wide, spacious feel |
| *stringendo* | `G3-U5-L05` | gradually getting faster, pressing on | — | a chase that speeds up more and more towards the end |
| *alla breve* | `G3-U5-L05` | two minim beats in a bar (the sign ¢), which usually feels quicker than the written notes look | — | a march felt as two minim beats in each bar, so that it sounds quicker than the note values suggest |
| *comodo* | `G3-U5-L05` | comfortable: at an easy, convenient speed | tempo comodo: at a comfortable speed | an easy walking tune played at a speed that feels comfortable |
| *rubato* | `G3-U5-L05` | with some freedom of time: the player may push and pull the beat | tempo rubato: with some freedom of time | a romantic melody in which the player bends the beat a little for expression |
| *forza* | `G3-U5-L06` | force, strength | — | a passage played with great strength and force |
| *deciso* | `G3-U5-L06` | with determination | — | a firm, determined entry that leaves no doubt |
| *risoluto* | `G3-U5-L06` | bold, strong and resolute | — | a bold, resolute statement |
| *pesante* | `G3-U5-L06` | heavy | — | heavy, stamping steps like a giant walking |
| *marcato (marc.)* | `G3-U5-L06` | emphatic and accented | — | a pattern in which every note is stressed and clear |
| *energico* | `G3-U5-L06` | energetic | — | an energetic dance full of drive |
| *delicato* | `G3-U5-L07` | delicate | — | a delicate, fragile tune like snow falling |
| *leggiero* | `G3-U5-L07` | light and nimble | — | light, nimble notes, like tiptoeing |
| *tranquillo* | `G3-U5-L07` | calm | — | a calm lullaby, peaceful and still |
| *semplice* | `G3-U5-L07` | simple and plain | — | a plain folk song with no decoration |
| *ben* | `G3-U5-L07` | well | ben marcato: well marked: clearly emphasised | — |
| *tanto* | `G3-U5-L07` | so much | non tanto: not so much | — |
| *agitato* | `G3-U5-L08` | agitated and restless | — | a restless, agitated storm of notes |
| *mesto* | `G3-U5-L08` | sad | — | a sad, mournful lament |
| *triste* | `G3-U5-L08` | sad and sorrowful | — | a sorrowful song of loss |
| *amore* | `G3-U5-L08` | love | amoroso: loving | a tender song about love |
| *anima* | `G3-U5-L08` | soul or spirit | con anima: with feeling, or spirited | — |
| *animato* | `G3-U5-L08` | animated and lively | animando: becoming more lively | an animated, lively country dance |
| *marziale* | `G3-U5-L09` | in a military style | — | a military march for a parade |
| *scherzando* | `G3-U5-L09` | playful and joking | — | a playful, joking piece, like a clown's tune |
| *brio* | `G3-U5-L09` | vigour and spirit | con brio: with vigour: lively and spirited | a bright, spirited piece played with vigour |
| *ritmico* | `G3-U5-L09` | rhythmically: with a bold, clear beat | — | a piece in which the beat is bold, clear and rhythmic |
| *sempre* | `G3-U5-L10` | always | sempre staccato: always short and detached | — |
| *subito* | `G3-U5-L10` | suddenly | subito piano: suddenly quiet | — |
| *prima, primo* | `G3-U5-L10` | first | prima volta: the first time | — |
| *seconda, secondo* | `G3-U5-L10` | second | seconda volta: the second time | — |
| *volta* | `G3-U5-L10` | time, as in “once” or “twice” | prima volta: the first time; seconda volta: the second time | — |
| *ad libitum (ad lib.)* | `G3-U5-L10` | at the player's choice: the passage may be played freely | — | a passage that the player is allowed to take freely, at their own choice |
| *veloce* | `G4-U5-L06` | swift | — | a swift, rushing run of notes |
| *voce* | `G4-U5-L06` | voice | sotto voce: in an undertone: very softly, as if in a low voice | — |

## 7. Reproduce

```
npm run docs:terms -w @mtp/api                       # this file
npx tsx scripts/terminology-inventory.ts [--exclude-book]   # the classification (--exclude-book gives the before figures)
npm run author:terms -w @mtp/api                     # the content overlay (run after any author:gradeN)
```
