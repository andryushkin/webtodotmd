# Against another clipper

`compare.ts` scores two clips of the same page against a fixed list of yes/no
checks. It exists because the store slide claims this extension passes 21 of
them where the nearest clipper passes 5, and a number on a storefront that
nobody can re-derive is a number nobody should believe.

```bash
bun tests/clippers/compare.ts ours.md theirs.md
```

Each argument is a Markdown file — whatever a clipper wrote. The script prints
one line per file (`21/21  100%`) and then, for each file, which checks it
missed.

## Getting the two clips

The page both sides clip is `docs/test_conversion_spec_page_compact.html`,
served over HTTP — extensions cannot run on `file://`:

```bash
python3 -m http.server 8899 --directory docs
```

Then, in each extension in turn: select the whole document (⌘A / Ctrl+A),
capture, save the Markdown. Same page, same selection, both times. Clips are
not committed here: they are another product's output, they age with every
release of it, and a stale one would make the score look measured when it is
merely remembered.

## The list is the argument

The checks were written from the *page's* cases, before either clip was scored.
That order matters more than the count: a list assembled after seeing the
answers measures the person who assembled it. Adding a check is welcome;
adding one because it flatters a side is not, and the file says so above the
list.

One check covers eighteen ways of hiding text from the reader, rather than
eighteen checks covering one each. Scored separately they would put half the
weight of the whole list on a single question, and the score would have been
engineered rather than measured — the first draft did exactly that and read
100% against 13%.

## What the score does not say

Both sides clipped one page, and it is a page this project wrote — so it asks
the questions this project already knows to ask. It says nothing about pages
neither clipper has seen. The other clipper is also built around Readability:
it takes the article it detects rather than the selection you made, so several
of its misses follow from a different promise rather than from a defect.

Either sentence belongs next to the number wherever the number is quoted.
