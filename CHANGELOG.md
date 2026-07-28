# Changelog

Versions are the ones published to the Chrome Web Store, newest first, dated by
submission and tagged `vX.Y.Z`. What each bump means, and the store's own rules
about version numbers, are in [docs/releasing.md](docs/releasing.md#versioning).

## 1.4.9 — 2026-07-29

A pass over the panel and the settings page, from the reader's side of them.

### Sending a note somewhere

- **A note can be sent to Obsidian.** A button beside the others hands it over the
  same way the Obsidian Web Clipper does — the text travels in the clipboard, the
  URL carries only the file name, so length is not a limit. On by default, and it
  can be switched off in Settings for anyone who does not use Obsidian.
- **The EditMD button is now the word `.md`.** It said "EditMD", which in the
  longer locales cost the toolbar a whole row; the file this extension writes is
  what the hand-off is about, and the app's name is in the tooltip.

### Naming things

- **Every button names itself, in your language.** Hovering any of them says what
  it does in the status bar. Six — the gear, undo, redo, the highlighter and the
  two view toggles — had an English name hard-coded regardless of the interface
  language, and the three icon-only ones had no name at all, on screen or to a
  screen reader.
- **A message in the status bar is no longer swallowed.** Moving the pointer over a
  button could clear an error or a confirmation the moment it appeared — including
  the one the button you just pressed had put there.
- **The highlighter reports being on the way assistive technology expects.**

### The settings page

- **Every on/off setting is a switch** rather than a tick box.
- **A link to the site and to the source.** Both at the foot of the page; the
  extension is open source, and that is where a bug can be reported.
- **The captured HTML is a button, not a third view.** It was a tab beside the
  preview and the source, which is a lot of room for a debugging aid; the setting
  now adds a button that copies that markup, and the tab is gone. The setting's
  name changed with it, so it needs switching on again if you had it on.

### Conversion

- **A fix for tables whose carrier rows were swept in a library caller**, where a
  node list is not iterable the way it is in a browser.

## 1.4.8 — 2026-07-28

One entry for one submission: 1.4.1 through 1.4.7 were built, tested and never
published, so everything below reaches a reader of the store at once. Most of it
was found the same way — capturing a page written case by case against the
conversion contract, then looking at that page in a browser beside the file it
produced — and the rest by capturing real sites and reading what came back.

### Styling a page states in CSS

- **Bold and italic written in CSS are no longer lost.** Notion, Medium,
  Substack, Confluence and anything built with Tailwind mark emphasis with a
  class rather than a `<b>` or an `<em>`, and so does text pasted out of Google
  Docs or Word. All of it used to arrive as plain text. It now converts, and a
  heading or a table header stays as it was — the mark is written where a run is
  heavier than the text around it, not wherever the page happens to state a
  weight.
- **A highlighted phrase survives, as `==marked text==`.** It used to arrive as
  plain text with nothing to say the reader had seen it marked. Both spellings
  are read: the `<mark>` tag, and the background every editor with a highlighter
  button writes instead. Markdown has no standard highlight, so the marker is
  written for the editors that understand it, Obsidian and EditMD among them;
  elsewhere it shows as four `=` characters. A page printing `x==y` is escaped so
  nothing it wrote acquires a highlight, and what is painted without being marked
  stays plain — a card, a callout, a striped row, a button, and the monospaced
  chip a page uses when it means code.
- **Column alignment survives.** A table that aligns a column with a class kept
  its columns but lost the alignment.
- **A page showing Markdown as text stays text.** A styled block holding
  `# heading` or `---` turned it into a real heading or a horizontal rule.

### What the page drew on one line

- **A mention no longer breaks the sentence it stands in.** An inline thing given
  a box of its own — a mention, a tag, a badge — sat in a flex row, and the row
  was the only reason the words shared a line. The file held three paragraphs
  where the page showed one sentence, the last opening on a stray space. The
  lines are now counted rather than read off `flex-direction`: what the reader
  met on one line arrives on one line. A row of cards is the same markup carrying
  paragraphs and keeps its blocks, a heading keeps its level, a list keeps its
  bullets.
- **A row of links, tags or chips is a row.** A navigation bar, a toolbar, a tag
  list: CSS put their items on one line and each came back as its own paragraph,
  or with nothing between them at all — `c#pythonjava`. The blank the reader saw
  is written, and with it emphasis can be spelled the way Markdown spells it;
  47 tags in one capture had been falling back to raw `<strong>`.
- **A paragraph is a paragraph again.** Every line of an ordinary indented page
  was arriving with a hard break after it: the newlines HTML source is written
  with were read as line breaks the author drew. They are now read the way a
  browser reads them — as spaces — while a caption that really does break its
  lines inside one element keeps them.
- **Two spaces where the page drew one.** Between two inline elements the
  indentation of the markup and a space inside the second one were both kept.

### Formulas

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
- **A formula whose page carries no LaTeX no longer vanishes.** KaTeX configured
  for HTML output builds no MathML at all, and MathJax without its accessibility
  extension emits none either. With maths on, both left an empty space where the
  formula had been — less than the same capture produced with maths off. The
  drawing now reaches the file when nothing better is there.
- **A formula that says one thing and shows another follows the screen.** Some
  pages run ordinary text through a maths renderer; the hidden half then holds
  something the reader never saw, once including markup that reached the file as
  an attribute nobody had on screen. Where the hidden half uses none of LaTeX, or
  carries a tag, what was drawn wins. Real formulas are untouched.

### What is on screen, and what only looks as if it is

- **Text hidden only from screen readers is kept.** `aria-hidden` takes a node
  out of the accessibility tree and leaves every pixel on the screen: a star
  rating, the arrow in a "read more" link, a number beside a chart. All of it was
  being deleted.
- **Text meant for screen readers alone stays out of the file.** "Skip to main
  content", "(opens in a new tab)" and the rest of the `.sr-only` idiom was
  copied out as if it had been on the page — including its commonest spelling,
  `clip: rect(0, 0, 0, 0)` without units, and the text a page hides in a box it
  keeps open for one visible line.
- **A collapsed section stays collapsed.** The body of a `<details>` nobody
  opened was being captured: one documentation page carried 500 words of folded
  sidebar the reader never saw.
- **A section a page fades in on scroll is captured.** One written with a
  transition on `visibility` was read as a dropdown standing by and dropped.
- **The extension no longer captures itself.** A full-page capture ended with the
  words `add to .md` — the floating bubble is an element on the page like any
  other, and a Cmd+A selection covered it.

### Selecting part of a page

- **A selection made inside a web component is captured.** It used to come back
  empty — a browser hides a component's own nodes from an ordinary selection.
- **A web component's fallback text no longer doubles.** A date shown as
  `3 days ago` was arriving as `3 days agoJul 24, 2026`, the second half being
  the text the component replaces for readers without JavaScript.
- **Dragging across a sentence inside a bold box keeps the bold.** Selecting the
  whole box was always right; dragging *within* it — the commoner gesture — left
  the weight behind, so a line whose second half the reader saw in bold arrived
  with no emphasis at all.
- **A selected navigation bar, header, footer or sidebar is captured.** They were
  dropped as page furniture even when the selection was made of them — and the
  same rule ate the headline and byline of a highlighted article, because a news
  site keeps both in a `<header>` inside it.
- **Two selections dragged at once are separated by one blank line, not two.**

### Code, lists, tables and the rest

- **Indented code stays indented.** Every syntax highlighter puts the blank
  between two tokens in a tag of its own, and those blanks were being dropped
  with the tag: a YAML sample came back flush left with `anchor_linenums:true`,
  and a Python one as `importtensorflowastf`. Off a code block the same removal
  ran two ordinary words together.
- **Blank space no longer opens a code block.** Whitespace between two blocks is
  drawn nowhere by a browser and was written into the file; four such gaps in a
  row turned the paragraph after them into a listing.
- **A nested list under a task item is still a list.** `- [x] ` was counted as
  part of the marker, which pushed everything under it four columns too far: the
  nested list arrived as literal text, and a second paragraph arrived in a
  monospace box.
- **Quotation marks are written where the page drew them.** A `<q>` showed
  `“quoted”` and the file said `quoted`. The pair follows the page's language —
  `«…»`, `„…“`, `「…」`.
- **A ruby reading no longer welds itself to the word.** `漢字` with `かんじ` above
  it arrived as `漢字かんじ`, one word read twice; it is now `漢字(かんじ)`.
- **Text no longer disappears next to a tilde.** A `~` standing beside struck-
  through text formed a code fence, and everything it enclosed vanished from the
  file. A tilde in ordinary prose — `~/src`, `~5 min` — is untouched.
- **An image with no address no longer becomes a broken one.** It reached the
  file pointing at the page being captured, instead of leaving the description
  the reader would have seen.
- **Code folded into a table cell keeps its indentation.**
- Lists numbered `NaN.` when the page wrote a `start` no number could be read out
  of.

### Where a capture lands, and what you can see of it

- **A capture with no top heading of its own now lands at `###`.** It landed at
  `##` before, which reads correctly in a note of its own — the title is in the
  front matter, so nothing competes for `#` — and wrongly in the far commoner
  case of a clip pasted into a note that already exists: it arrived level with
  that note's own sections instead of under the one it was put in. A capture
  that starts at `<h1>` or `<h2>` is untouched; the lift only ever goes up.
- **New setting: show the captured HTML view.** Off by default. It adds a third
  view holding the markup the conversion was given, so a conversion defect can be
  reported — and reproduced — without anyone having to guess what was on the
  page.

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
