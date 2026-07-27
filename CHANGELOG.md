# Changelog

Versions are the ones published to the Chrome Web Store, newest first, dated by
submission and tagged `vX.Y.Z`. What each bump means, and the store's own rules
about version numbers, are in [docs/releasing.md](docs/releasing.md#versioning).

## 1.4.5 — 2026-07-27

- **Indented code stays indented.** Every syntax highlighter puts the blank
  between two tokens in a tag of its own, and those blanks were being dropped
  with the tag: a YAML sample came back flush left with `anchor_linenums:true`,
  and a Python one as `importtensorflowastf`. Off a code block the same removal
  ran two ordinary words together.
- **A row of tags reads as a row.** Items laid side by side by CSS had nothing
  between them in the markup, so a list of tags arrived as `c#pythonjava`. The
  blank the reader saw is written, and with it emphasis can be spelled the way
  Markdown spells it — 47 tags in one capture had been falling back to raw
  `<strong>`.
- **A collapsed section stays collapsed.** The body of a `<details>` nobody
  opened was being captured: one documentation page carried 500 words of folded
  sidebar the reader never saw.
- **A web component's fallback text no longer doubles.** A date shown as
  `3 days ago` was arriving as `3 days agoJul 24, 2026`, the second half being
  the text the component replaces for readers without JavaScript.
- **New setting: show the captured HTML view.** Off by default. It adds a third
  view holding the markup the conversion was given, so a conversion defect can
  be reported — and reproduced — without anyone having to guess what was on the
  page.

## 1.4.4 — 2026-07-27

- **A paragraph is a paragraph again.** Every line of an ordinary indented page
  was arriving with a hard break after it: the newlines HTML source is written
  with were read as line breaks the author drew. They are now read the way a
  browser reads them — as spaces — while a caption that really does break its
  lines inside one element keeps them.
- **A row of links is a row.** A navigation bar, a chip row, a toolbar: CSS puts
  their items on one line, and each one was coming back as its own paragraph.
- **A selection made inside a web component is captured.** It used to come back
  empty — a browser hides a component's own nodes from an ordinary selection.
- **Two spaces where the page drew one.** Between two inline elements the
  indentation of the markup and a space inside the second one were both kept.

## 1.4.3 — 2026-07-27

Everything below was found by capturing one page — a fixture written case by
case against the conversion contract — and then by looking at that page in a
browser beside the file it produced. 1.4.2 was never published; its entries are
folded in here, since one release is one entry.

- **A formula on Wikipedia is a formula again.** Every renderer draws a formula
  twice: a picture for the eye, and an invisible twin that carries the meaning.
  The twin is hidden the way a screen-reader-only note is hidden, so it was
  deleted before it could be read — one article gave 31 pictures and not one
  formula. A KaTeX page fared worse: the formula vanished from the sentence
  altogether.
- **A formula that stood in a sentence stays in it.** Wikipedia wraps every
  formula in `{\displaystyle …}`, inline ones included, and that wrapper was read
  as "this is a display block", so a paragraph carrying three of them came back
  as three centred blocks. The wrapper itself no longer travels into the file,
  where it used to follow the formula into whatever it was pasted into.
- **A selected navigation bar, header, footer or sidebar is captured.** They were
  dropped as page furniture even when the selection was made of them — and the
  same rule ate the headline and byline of a highlighted article, because a news
  site keeps both in a `<header>` inside it.
- **Text hidden only from screen readers is kept.** `aria-hidden` takes a node
  out of the accessibility tree and leaves every pixel on the screen: a star
  rating, the arrow in a "read more" link, a number beside a chart. All of it was
  being deleted.
- **More text meant for screen readers alone stays out.** The commonest spelling
  of the `.sr-only` idiom, `clip: rect(0, 0, 0, 0)` without units, was not
  recognised. Nor was the text a page hides in a box it keeps open for one
  visible line.
- **A section a page fades in on scroll is captured.** One written with a
  transition on `visibility` was read as a dropdown standing by and dropped.
- **Quotation marks are written where the page drew them.** A `<q>` showed
  `“quoted”` and the file said `quoted`. The pair follows the page's language —
  `«…»`, `„…“`, `「…」`.
- **A ruby reading no longer welds itself to the word.** `漢字` with `かんじ` above
  it arrived as `漢字かんじ`, one word read twice; it is now `漢字(かんじ)`.
- **A nested list under a task item is still a list.** `- [x] ` was counted as
  part of the marker, which pushed everything under it four columns too far: the
  nested list arrived as literal text, and a second paragraph arrived in a
  monospace box.
- **An image with no address no longer becomes a broken one.** It reached the
  file pointing at the page being captured, instead of leaving the description
  the reader would have seen.
- **Blank space no longer opens a code block.** Whitespace between two blocks is
  drawn nowhere by a browser and was written into the file; four such gaps in a
  row turned the paragraph after them into a listing.
- **Two selections dragged at once are separated by one blank line, not two.**
- **Code folded into a table cell keeps its indentation.**
- Lists numbered `NaN.` when the page wrote a `start` no number could be read out
  of.

## 1.4.1 — 2026-07-27

- **Bold and italic written in CSS are no longer lost.** Notion, Medium,
  Substack, Confluence and anything built with Tailwind mark emphasis with a
  class rather than a `<b>` or an `<em>`, and so does text pasted out of Google
  Docs or Word. All of it used to arrive as plain text. It now converts, and a
  heading or a table header stays as it was — the mark is written where a run is
  heavier than the text around it, not wherever the page happens to state a
  weight.
- **Text meant for screen readers stays out of the file.** "Skip to main
  content", "(opens in a new tab)" and other content hidden with `.sr-only` or
  `.visually-hidden` was copied out as if it had been on the page. A section a
  page is about to fade in is kept, because it is not withheld — only not shown
  yet.
- **Column alignment survives.** A table that aligns a column with a class kept
  its columns but lost the alignment.
- **Text no longer disappears next to a tilde.** A `~` standing beside struck-
  through text formed a code fence, and everything it enclosed vanished from the
  file. A tilde in ordinary prose — `~/src`, `~5 min` — is untouched.
- **A page showing Markdown as text stays text.** A styled block holding
  `# heading` or `---` turned it into a real heading or a horizontal rule.

## 1.4.0 — 2026-07-26

- **Tables with merged cells now stay tables.** A table Markdown has no syntax
  for — merged cells, a table inside a cell, a cell holding code — used to be
  copied out as raw HTML, which renders nowhere except the panel and stops the
  cell from being Markdown at all. It is now folded into an ordinary table: a
  merged cell keeps its text and leaves the space it spanned empty, a nested
  table becomes its rows, and code keeps its lines. **Keep complex tables as
  HTML** in the settings restores the old output.
- **What the page shows as text stays text.** A page written *about* HTML — a
  tutorial, a changelog, API documentation — used to lose it: `</td>` vanished
  from the file, and an HTML comment swallowed the sentence after it. The same
  now holds for text split across styling, which is how syntax highlighting
  writes it.
- **Bold and italics survive where they used to be dropped.** Emphasis pressed
  against punctuation, against a word, or against another emphasis produced
  asterisks the reader could see and formatting they could not. So did an emoji
  next to it.
- **A partial selection keeps its context.** Dragging out of a table into the
  paragraph below no longer loses the header row; a table with no `<thead>` keeps
  its first row; the eighth item of a numbered list is captured as the eighth.
  Code in a `<pre>` keeps the lines it was broken into.
- Links keep targets they used to lose — `tel:`, `ftp:` and addresses containing
  brackets — while `javascript:` loses the link and keeps the text.
- Definition lists (`<dl>`) convert instead of running the term into the
  definition.

## 1.3.0 — 2026-07-25

- **Send to EditMD is a macOS button.** EditMD is a Mac app, and on other
  platforms nothing answers the `editmd://` hand-off, so the button no longer
  appears there.
- Fixed a hand-off that could fail silently: a page title truncated in the
  middle of an emoji produced a broken file name, and the EditMD button then
  did nothing at all — after the note had already replaced the clipboard.
  Download names were affected by the same cut.
- Copying now says so when it fails. Chrome refuses a clipboard write while the
  panel does not have focus, which happens whenever the last click was in the
  page; Copy, Copy `.txt` and Send to EditMD reported nothing and looked inert.

## 1.2.2 — 2026-07-24

- **Send to EditMD** — a toolbar button hands the note off to
  [EditMD](https://github.com/andryushkin/editmd) over the `editmd://` URL
  scheme (body via clipboard, filename in the URL).
- Page titles now decode HTML entities the way the HTML tokenizer does: the
  full WHATWG named-reference set, longest match first, one pass only. Sites
  that double-encode their `og:title` no longer leak `&nbsp;` into the front
  matter or the filename.
- Titles are truncated by grapheme cluster, so emoji and ZWJ sequences never
  get cut in half.
- Responsive toolbar: it collapses to icons only when the panel is too narrow,
  keeping accessible names on every button.

## 1.2.1 — 2026-05-25

- Fixed a duplicate context-menu id error that could break the right-click
  entry after a language change.
- Extension renamed to "HTML Text to .md — Online Markdown Web Clipper".

## 1.2.0 — 2026-04-04

- Plain-text export: a `.txt` menu next to the Markdown actions (copy and
  download without Markdown syntax).
- Undo/redo moved to the header, next to the settings button.
- Capture pipeline fixes for paragraph splitting, YAML front matter escaping,
  and selections that start or end mid-word.

## 1.1.0 — 2026-03-28

- Star rating widget in the side panel and settings page.
- Corrected store descriptions in nine locales.

## 1.0.0 — 2026-03-22

First Chrome Web Store release.

- Selection capture with a floating button, multi-range support and Shadow DOM
  flattening.
- Highlighter mode for collecting whole blocks across a page.
- Side panel with rendered preview and raw source, copy and `.md` download.
- YAML front matter with title, source URL and capture date.
- <kbd>Alt</kbd>+<kbd>M</kbd> to copy a selection,
  <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> to append it to the panel.
- Settings page, 52 locales, RTL layout, anonymous usage counters.
