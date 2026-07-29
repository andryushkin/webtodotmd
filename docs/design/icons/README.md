# Slide 5 icons

The six glyphs from `docs/design/slide-5-why.html`, one file each, in the order
they sit on the slide. Extracted from the mock-up rather than drawn again, so a
change to the slide and a change to these files are the same change — re-run the
extraction if the tiles move.

| File | Tile |
| --- | --- |
| `01-hidden-text.svg` | 0 — hidden text in your note |
| `02-languages.svg` | 52 — interface languages |
| `03-cases.svg` | 90 — conversion cases, published |
| `04-tests.svg` | 1855 — automated tests |
| `05-export.svg` | 4 — ways out: .md · .txt · Obsidian · EditMD |
| `06-checks.svg` | 4× — more checks passed than the nearest clipper |

Drawn at 40 × 40 on a 24-unit grid, strokes only — no fills, so scaling costs
nothing and the weight stays even. The accent is baked in as a hex rather than
`currentColor`: pasted into a layout tool, `currentColor` resolves to black and
the glyph arrives invisible on a dark field. Blue `#a9d3f0` and violet `#d9b8f5`
alternate tile by tile, matching the captions burnt into screenshots 1–4.

They are placeholders. If a bought or drawn set replaces them, keep the two
properties that make the row read as one: a single stroke weight (1.7 at this
size) and one grid.

`preview.html` shows all six on the slide's own background — open it to check a
replacement before it goes into the mock-up.
