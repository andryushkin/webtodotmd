# Side panel — invariants

The only surface the user reads the result on. What it shows and what the file
holds must be the same thing, which is where most of these come from.

Each rule below has cost a bug already; the reason is what makes it stick.

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
- `DOMPurify.sanitize()` before any `innerHTML`. marked runs with `html: true`
  so injected KaTeX and metadata blocks render — literal tags in captured text
  are made inert by the core, not here. The panel had a second escaper that
  re-parsed the finished Markdown to guess which tags were the core's own; it
  drifted both ways and is gone. Anything that emits text must appear in
  `tests/fidelity/no-live-markup.test.ts` before it can be trusted.
- Status has two layers: `setBaseStatus()` for readiness, `setTempStatus()` for
  errors and confirmations. Never call `setStatus()` directly — it uses
  `innerHTML`, so messages must pass through `escHtml()`.
- `setButtonContent()` always sets `aria-label`: in compact mode the visible
  label is gone. `updateToolbarDensity()` measures in the non-compact state,
  which is what stops it oscillating.

## The HTML view

- It is a *report*, not a document. `rawMd` stays the only source of truth for what the panel
  renders, edits, saves and sends; the HTML pane holds the markup the last capture was handed —
  the selection with its style snapshot — and is replaced rather than appended, because whoever
  sends it on wants the fragment behind the paragraph in front of them, not the whole session.
- Off by default, and while it is off the content script does not build it: the fragment carries a
  computed style on every element that needed one and outweighs the Markdown on a long article.
- Its label is the word `HTML`, deliberately untranslated — it is the name of the format in every
  locale this ships in, and a fifty-second string that always reads the same is a fifty-second
  string to keep in sync for nothing. The setting that reveals it is translated (`labelHtmlView`).
- Turning the setting off while that view is on screen falls back to the source view: a hidden tab
  with its pane still showing is a panel with no way back.
