# Features

A factual description of what the extension does — the reference behind the
store listing, not marketing copy. Written against version 1.4.1.

## Three ways to capture

### Selection

Select text on a page, then click **Capture** in the side panel. The selection
is converted to Markdown with its structure intact: headings, lists, tables,
code blocks, links, images.

Several fragments selected at once (⌘/Ctrl-click) are joined into one document.
After a capture the selection is cleared, so pressing Capture again with
nothing selected reports "no selection" rather than repeating the result.

### Highlighter mode

Element-by-element picking, toggled from the panel. While it is on, hovering a
block (paragraph, heading, list, table, code block, quote) outlines it, and
clicking pins it. Clicking a pinned element again releases it; elements can be
picked in any order.

Capture collects every pinned element into one document, in document order, and
clears the highlights afterwards. The mode switches itself off when the panel
closes or the active tab changes.

### Keyboard

- <kbd>Alt</kbd>+<kbd>M</kbd> — convert the selection and copy it to the
  clipboard, confirmed by an on-page toast. The panel stays closed.
- <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> — open the side panel and append
  the selection to whatever is already there.

## Entry points on the page

- **Floating bubble** — an "add to .md" button appears next to a selection;
  clicking it opens the panel and captures. Can be turned off in settings.
- **Context menu** — right-click ▸ "add to .md" does the same.
- **Toolbar icon** — opens the panel and captures the current selection.

## Side panel

Two view modes, toggled in the header: **Preview** (rendered Markdown —
headings, tables, highlighted code, math) and **Source** (the raw Markdown in
an editable textarea). Source edits are reflected in the preview immediately,
with undo/redo history.

| Action | What it does |
| --- | --- |
| Copy | Copies the raw Markdown to the clipboard |
| Download | Saves a `.md` file, named after the page title |
| `.txt` menu | Copy or download the same content with Markdown syntax stripped |
| `.md` | Hands the note to the EditMD editor via the `editmd://` scheme — macOS only, the button is hidden elsewhere. Its whole label is `.md`; the app's name is in the tooltip |
| Obsidian | Hands the note to Obsidian via `obsidian://new?…&clipboard` — the note travels in the clipboard, the URL carries only the file name. On by default, switched off in Settings |
| Copy HTML | Copies the markup the last capture was handed, for a bug report. Off by default (Settings) |
| Clear | Empties the panel and resets history |
| Undo / Redo | Step through edit history |

The status bar shows readiness, errors (no selection, restricted page, timeout)
and confirmations. On a restricted page it explains why capture is unavailable.

## Accumulating clippings

Consecutive captures append to the panel instead of replacing it. Capturing
from a different page starts a new metadata block; with metadata disabled, a
`---` separator marks the boundary instead.

## Metadata

With "Auto-add metadata" on, each capture is preceded by YAML front matter:

```yaml
title: Page title
source: https://example.com/page
date: 2026-03-19T12:00:00Z
```

The title comes from Open Graph, Twitter Card, JSON-LD or `<title>`, in that
order of preference.

## Faithfulness

What the page showed is what the file renders. Markdown characters in the page's
own text are escaped, so a page displaying `**bold**`, `# heading` or
`[text](url)` as characters — a tutorial, a changelog, API prose — produces
`\*\*bold\*\*` in the source and those same characters in the preview, not bold
text and not a heading. The same holds for HTML: a page showing `</td>` or
`<!-- note -->` as characters produces `\</td>` and `\<!-- note -->`, because
Markdown carries raw HTML through and those would otherwise vanish from the file
— documentation and changelogs are full of them. Code, preformatted blocks and
LaTeX are left verbatim, where a backslash would be corruption rather than
protection; in a formula only a `<` that begins a tag or a comment is
neutralized, so `a < b` survives while `<img …>` cannot come back to life. Inside such a table nothing is escaped at all: Markdown is not
parsed there, so those characters already render as themselves — and for the same
reason bold, italics, code and links are written as HTML tags there rather than
as Markdown, which would have reached the reader as asterisks and brackets.

## Formatting support

Headings H1–H6, bold, italic, nested ordered and unordered lists, definition
lists, tables, fenced code blocks with language, inline code, links, images,
blockquotes, horizontal rules, `<sub>` and `<sup>`.

Formatting a page states in a style rather than in a tag counts too, whether it
wrote it in the `style` attribute or in a stylesheet: a `font-weight` of 600 or
more is bold, `font-style: italic` is italics, `text-decoration: line-through` is
strikethrough, and a `display` that makes an inline element a block puts its text
on a line of its own. Tailwind's `font-bold`, a Notion export, a Medium or
Confluence page — all of them say it with a class, and all of it survives the
capture. What is *not* written is a mark the output already carries: a bold
heading stays `##` with no asterisks inside it, a bold table header stays a
header, a `<strong>` that declares itself bold is bold once, and a run that is
merely as bold as the heading around it adds nothing. The reverse holds as well:
a `<strong>` the page styles back to `font-weight: normal` showed the reader no
bold text, so it keeps its text and loses the mark. Inside code, preformatted
text and formulas no mark is written at all — a `**` there would be two
characters of the sample.

A highlight is read the same way and written as `==marked text==`. The tag
`<mark>` is one way a page states one and the rarer way; every editor with a
highlighter button writes a background on a run instead — Google Docs, Notion,
Confluence — and both arrive. Markdown has no standard highlight, so this marker
is written for the editors that do understand it, Obsidian and EditMD among them;
a renderer that does not will show the four `=` characters. The page's own `x==y`
is escaped so that nothing it printed acquires a highlight. What is painted but
not marked stays plain: a card, a callout, a striped row, a button, and a
monospaced chip, which is a page's way of writing code without a `<code>` tag.

The same goes for the alignment of a table column: a header aligned right in a
stylesheet reaches the file as `---:`, exactly as one aligned right in its own
`style` attribute does.

Text the page hides never reaches the file: `display: none`, `visibility:
hidden`, `opacity: 0`, and the shapes a `.sr-only` or `.visually-hidden` class is
built from — a zero clip rect, a `clip-path` that insets the whole box, a text
indent or an offset far off the canvas, a one-pixel box that clips. That is where
"Skip to main content" and "opens in a new tab" live, and they were written for a
screen reader rather than for a note. A section a page is about to fade in is not
hidden, only not shown yet, and it is kept — a transition or an animation over
the transparency is the difference, whichever of the two the page states it in.

`visibility` is the one of these a page can take back further in: a box hidden
with something inside it declared visible again stays, and only the parts of it
still hidden go. Removing the box would take the visible part with it, and text a
reader was looking at is the expensive thing to lose.

Link targets are limited to the schemes a Markdown file can carry safely — the
same set the preview's sanitizer accepts, so the two halves of the product agree
on what a link is. `javascript:` and a `data:` document lose the link and keep
the text.

- **Tables** — pipe tables, with `|` inside a cell escaped and line breaks
  turned into `<br>` so a cell cannot end its own row. What GFM has no syntax
  for — merged cells, a nested table, preformatted text — is folded into the
  pipe form: a merged cell keeps its text where it starts and leaves the
  positions it spanned empty, a nested table becomes its rows one per line with
  the cells of each row joined by a middle dot and its `<caption>` as the first
  line, and preformatted text becomes one code span per line. A wrapper around the
  inner table does not hide it from the fold. Turning on **Keep complex tables as HTML** emits a plain
  HTML table carrying `colspan`/`rowspan`
  instead, which keeps the structure exactly — at the price that Markdown is not
  parsed inside an HTML block, so every cell stops being Markdown. The preview renders these tables rather than showing
  their markup, but Markdown is not parsed inside an HTML block by any renderer,
  so formatting inside such a cell — emphasis, links, a heading, a quote, a list —
  stays as its Markdown syntax rather than rendering. Only tables that GFM cannot
  express take this path, and preformatted text and nested tables, which are kept
  as elements, do render. That HTML is built by the converter, never copied from
  the page: in a fallback table, text the page wrote — including something that
  looks like a tag — is escaped, so it cannot close a cell or add behavior.
  Elsewhere in the output a literal tag is escaped by the converter itself, so it
  stays literal text in the file and in the preview alike.
  A `<caption>` is kept: as a caption in the fallback, as the line above a pipe
  table, as the first line of a folded nested cell.
- **Math** — inline `$…$` and display `$$…$$` render through KaTeX; MathML on
  the page is converted to LaTeX first. If rendering fails, the LaTeX source is
  shown.
- **Shadow DOM** — content inside web components is included in the capture,
  whether the selection covers the component or was made inside it. The second
  used to come back empty: a browser hides a component's nodes from an
  ordinary selection, moving both ends of the range onto the component itself.

## Settings

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| Auto-add metadata | toggle | on | Prepend the YAML block to each capture |
| Show floating bubble | toggle | on | Show the "add to .md" button near selections |
| Keep complex tables as HTML | toggle | off | Emit an HTML table for merged cells, nested tables and preformatted cells instead of flattening them into the pipe form |
| Default view mode | Preview / Source | Preview | View mode when the panel opens |
| Show the Obsidian button | toggle | on | Offer the Obsidian hand-off in the toolbar. A setting rather than a probe: `obsidian://` cannot be tested for a handler, so a reader without the app is the only one who can say |
| Add a button to copy the captured HTML | toggle | off | Add a toolbar button that copies the markup the conversion was given — the selection with its style snapshot. It is a debugging aid, not part of the document: it copies the last capture alone, and while the setting is off the capture does not build the markup at all |
| Highlight color | color | `#0066cc` | Highlighter mode outline and fill |
| Language | 22 choices + Auto | English | Interface language |

Changes apply immediately across every surface — panel, content script, context
menu — through `chrome.storage.onChanged`.

The UI itself ships in 52 locales; the dropdown offers explicit choices for 22
of them plus "Auto (browser language)", and Chrome falls back to the browser
locale for the rest. Arabic, Hebrew and Persian get a full RTL layout.

## Where it works

Any HTTP/HTTPS page. It cannot work on PDF files, `file://` pages, Chrome's own
pages (`chrome://`, `about:`, `chrome-extension://`) or other extensions'
pages — Chrome does not allow content scripts there. On such tabs the capture
button is disabled and the status bar explains why.

## Privacy

Page content is converted in the content script and never leaves the browser —
there is no backend to receive it. The one network call is an anonymous usage
counter: a random install ID and an event name (`copy`, `download_md`,
`send_editmd`, `send_obsidian`, a rating value) sent to `2md.site`. No URLs, no page content, no
personal data. See [privacy-policy.html](../privacy-policy.html).

The rendered preview is sanitized with DOMPurify, and HTML tags found in captured
text are escaped by the converter, so they reach the file and the preview as the
characters the page displayed.

## Technical profile

Manifest V3, no runtime dependencies loaded from the network. The content
script bundle is ~275 KB, dominated by the complete WHATWG entity table and the
conversion core; the side panel bundle is larger because it embeds KaTeX.
Conversion is `htmltodotmd`, the library in [core/](../core/README.md);
preview is marked + DOMPurify; math is KaTeX; icons are inline Lucide-style
SVG.
