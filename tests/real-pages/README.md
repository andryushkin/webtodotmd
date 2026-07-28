# Real pages

The generated survey (`tests/fidelity/`) asks whether the conversion is faithful
to documents this project wrote. This asks the same question of markup nobody
here wrote, which is the only way to reach the cases a generator does not know
to generate — the two defects that started it, invented hard breaks and a flex
navigation row split into paragraphs, both came off ordinary pages.

Three parts:

- `harness.ts` — the capture path with no extension around it. It calls the same
  `selectionToMd()` the content script does, so what it measures is the product.
- `run.ts` — one Chrome, one context per page, the harness evaluated over CDP
  (a page's CSP can refuse an injected `<script>`; it cannot refuse this).
- `analyze.ts` — the oracle: what the reader saw, word by word, against what the
  file renders to.

The reader's own text is `innerText`, not `selection.toString()`. The latter
concatenates across block boundaries, so a column of navigation links reads back
as `HomeMoneyVAT` and every boundary is reported as a blank the file invented.

Differences are classified before they are read, because most of them are
expected: `maths` is a formula becoming LaTeX, `weld` is two words the file ran
together, `split` a blank it invented, `markup-shown` Markdown the render still
prints as characters, `lost` and `added` text on one side only.

```bash
bunx playwright install chromium   # once; the package itself is a devDependency
bun build tests/real-pages/harness.ts --target=browser --format=iife \
  --outfile=/tmp/harness.js
bun tests/real-pages/run.ts tests/real-pages/targets.json /tmp/harness.js store/research/real-pages
bun tests/real-pages/analyze.ts store/research/real-pages /tmp
```

`KINDS=weld,lost SHOW=6` on the analyze run picks which kinds to print and how
many per page. Output goes under `store/` — captures are megabytes and belong
outside the source tree.
