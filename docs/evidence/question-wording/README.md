# Question wording audit: browser evidence

Before/after pairs of representative questions (left: main at 94754cb; right: this branch), first screen without scrolling, light theme. Captured
with `packages/web/e2e/wording-shots.mjs` on the production build:

```bash
npm run build
SHOTS=out TAG=after LARGE_TEXT=1 node --import tsx packages/web/e2e/wording-shots.mjs   # from packages/web: node --import tsx e2e/wording-shots.mjs
```

`metrics.json` holds the measurements for every question at iPhone 14, 320 px phone, tablet and desktop sizes, each at normal and 200% text:
prompt words and height, where the music and the first answer control start, and where the fixed Check bar starts. The findings are in
[docs/curriculum/QUESTION_WORDING_AUDIT.md](../../curriculum/QUESTION_WORDING_AUDIT.md).
