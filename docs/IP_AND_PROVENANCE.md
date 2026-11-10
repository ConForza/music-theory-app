# Intellectual property and provenance policy

1. **The source book is an authoring reference only.** Eric Taylor's *First Steps in Music Theory* (ABRSM Publishing, 1999) is copyrighted. It must never be committed, bundled, uploaded to the app or quoted in learner content. `.gitignore` excludes `*.pdf` and `reference/`, and the validator fails if any PDF, DjVu or EPUB file is in the repository.
2. **Citation pointers only.** `content/source-book/first-steps-sections.json` records each section's heading, grade, section number and printed page, so authors and teachers can trace topics. It contains no explanations, examples, diagrams or exercises from the book.
3. **Original content.** All learner-facing text, notation, audio and exercises are newly written. `LessonContent.provenance.originality` must be `"original"`, and adapted content is rejected by the schema.
4. **No implied endorsement.** Learner-facing text must not name the book, its author or ABRSM, or imply an official exam or certificate (validated). Practice assessments carry `disclaimer: practice-only-not-an-official-abrsm-assessment`. The product is not affiliated with or endorsed by ABRSM.
5. **Syllabus outcomes are paraphrased.** The outcome statements are short original paraphrases with item references, and the official PDF remains the authority. Its URL, date and SHA-256 hash are recorded in `content/release.json`.
6. **Third-party assets.** Any notation library, font or audio sample must be licensed for distribution and recorded here (asset register, Brief 03 / 11):

   | Asset | Source | Licence | Use |
   |---|---|---|---|
   | Bravura music font (woff2) | Steinberg Media Technologies, npm `@vexflow-fonts/bravura@1.0.2` | SIL Open Font License 1.1 (bundled unmodified; licence travels with the package) | SMuFL glyphs for clefs, notes, rests, accidentals, ornaments in the notation renderer |

   No notation library code, no audio samples (sound is synthesised), and no images from the reference book are used. Demonstration exercises (`content/exercises/showcase`) are original and generated from the rule engine.
