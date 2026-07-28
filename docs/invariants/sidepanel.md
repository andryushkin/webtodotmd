# Side panel — invariants

The only surface the user reads the result on. What it shows and what the file
holds must be the same thing, which is where most of these come from.

Each rule below has cost a bug already; the reason is what makes it stick.

Everything named here lives in `src/sidepanel/`, `sidepanel.ts` unless another
file is given.

## The note

- `rawMd: string` is the single source of truth, never `textarea.value`. Update
  through `setContent(md)`; Copy always reads `rawMd`.
- The panel carries the heading base across presses (`headingBase`), and it is the only thing that
  can: a capture is one conversion in the content script, and on its own each press puts whatever it
  found at the top level. Capture a section's `<h2>`, then the `<h3>` under it, and both arrived as
  `##` with nothing under them. The level goes out with the response (`topLevel`, before any shift),
  the smallest is kept, and it goes back in with the next request. It belongs to the document, so it
  resets with Clear and whenever the capture comes from another URL. What is already in the panel is
  never re-shifted: capture something deep and then an `<h1>`, and the first stays where it was
  written while the `<h1>` arrives as `#` — the ranks come closer together, in the right order.
  Rewriting the text above would mean rewriting lines the reader may have edited by hand, and the
  panel's own text is the one thing it must not lose. Decided with the user, 2026-07-27.
  It has to be judged *before* the request, not after the answer. The reset was on the way back,
  once the Markdown had been built: capture a page whose shallowest heading is an `<h3>`, move to
  another URL, capture a section starting at `<h5>`, and the content script was handed a base of 3,
  shifted by -1 and returned `####` with no `#`, `##` or `###` anywhere above it — after which the
  panel set the base to 5, having lost the only text that could have spent it. The tab's URL is what
  the panel has to go on at that moment; the page's own is asked again on the way back, because a
  tab can navigate in between, and where the two disagree the base is dropped. No shift leaves a
  heading at its own rank; a shift against the wrong document leaves it under nothing.
- The front matter is written and read back by two expressions that must agree: `buildMetadata()`
  writes single-quoted YAML, doubling only the `'`, because an og:title full of `"` came back as a
  hedge of `\"`; `METADATA_RE` still accepts the double-quoted spelling, since notes written before
  that change are in people's files and a block the regex misses is shown as three lines of raw
  YAML above the note. Widening one side without the other loses the block on exactly the documents
  that already exist.

## Rendering

- `DOMPurify.sanitize()` before any `innerHTML`. marked runs with `html: true`
  so injected KaTeX and metadata blocks render — literal tags in captured text
  are made inert by the core, not here. The panel had a second escaper that
  re-parsed the finished Markdown to guess which tags were the core's own; it
  drifted both ways and is gone. Anything that emits text must appear in
  `tests/fidelity/no-live-markup.test.ts` before it can be trusted.
- The preview is built from `rawMd` and never edits it. Every pass in
  `renderMarkdown()` — the maths, the metadata block, the content gaps — runs on a copy on the way
  to `marked`, so what any of them gets wrong is what the reader is *shown* rather than what they
  save. That is the whole of what the preview is for, and it is what makes the rules below cost a
  wrong-looking pane instead of a wrong file.

## The preview's maths

- A bare pair of dollars is what a price looks like: `**$129.00** ~~$159.00~~`, an ordinary
  product card, was read as one formula from `129.00` to `159.00` and KaTeX drew the asterisks
  between them as mathematics, and `Costs $5 and $7 in total.` went the same way. The three
  conditions are Pandoc's and they are about the dollars, not the body — the body between two
  prices is `129.00** ~~`, which no test for "looks like money" would catch: an opening dollar is
  not followed by a blank, a closing one is not preceded by one, and a closing one is not followed
  by a digit. The last is what parts two amounts.
- A formula leaves that pass as a `<span data-katex="…">` holding an id, never the LaTeX itself,
  and never a `<div>` even in display mode. The id is why the LaTeX cannot become markup: it is
  kept aside in `mathMap` and reaches the DOM only through `renderMathInDOM()`, after
  `DOMPurify.sanitize()` has run. A `<div>` there would open an HTML block that swallows the rest
  of the paragraph, and the blank lines around it would close the HTML block of a fallback table
  whose cell holds the formula. The span is styled as a block in CSS instead.
- `renderMathInDOM()` renders with `throwOnError: false` and falls back to writing the source back
  out as `$…$` in the `catch`. A formula the panel cannot draw is still a formula the file holds,
  and an empty span says nothing about what is missing.

## Status and toolbar

- Status has two layers: `setBaseStatus()` for readiness, `setTempStatus()` for
  errors and confirmations. Never call `setStatus()` directly — it uses
  `innerHTML`, so messages must pass through `escHtml()`.
- `setButtonContent()` always sets `aria-label`: in compact mode the visible
  label is gone. `updateToolbarDensity()` measures in the non-compact state,
  which is what stops it oscillating.

## The captured HTML

- It is a *report*, not a document. `rawMd` stays the only source of truth for what the panel
  renders, edits, saves and sends; `rawHtml` holds the markup the last capture was handed —
  the selection with its style snapshot — and is replaced rather than appended, because whoever
  sends it on wants the fragment behind the paragraph in front of them, not the whole session.
  Clear throws it away with the note it explains.
- Off by default, and while it is off the content script does not build it: the fragment carries a
  computed style on every element that needed one and outweighs the Markdown on a long article.
- It reaches the reader as one toolbar button (`Copy HTML`, `#btn-copy-html`) which the setting
  reveals, not as a view. It was a third tab beside the preview and the source until 1.4.9, and a
  debugging aid does not earn a place in the row a reader uses on every capture — the panel is
  narrow and the two views are what it is for.
- Its own enabled state is `rawHtml`, not the note: text typed by hand has no markup behind it, and
  neither has a capture made before the setting was turned on. A button that copies an empty string
  reports nothing and looks like a failure of the capture.
- Revealing or hiding it re-measures the toolbar (`updateToolbarDensity()`). A button appearing in a
  row that already fitted wraps onto a second one and stays there until the panel is resized.
