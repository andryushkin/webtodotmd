# Changelog

Versions are the ones published to the Chrome Web Store, newest first, dated by
submission and tagged `vX.Y.Z`. What each bump means, and the store's own rules
about version numbers, are in [docs/releasing.md](docs/releasing.md#versioning).

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
