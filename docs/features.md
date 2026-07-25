# Features

A factual description of what the extension does — the reference behind the
store listing, not marketing copy. Written against version 1.3.0.

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
| EditMD | Hands the note to the EditMD editor via the `editmd://` scheme — macOS only, the button is hidden elsewhere |
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

## Formatting support

Headings H1–H6, bold, italic, nested ordered and unordered lists, tables,
fenced code blocks with language, inline code, links (absolute URLs), images,
blockquotes, horizontal rules, `<sub>` and `<sup>`.

- **Math** — inline `$…$` and display `$$…$$` render through KaTeX; MathML on
  the page is converted to LaTeX first. If rendering fails, the LaTeX source is
  shown.
- **Shadow DOM** — content inside web components is included in the capture.

## Settings

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| Auto-add metadata | toggle | on | Prepend the YAML block to each capture |
| Show floating bubble | toggle | on | Show the "add to .md" button near selections |
| Default view mode | Preview / Source | Preview | View mode when the panel opens |
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
`send_editmd`, a rating value) sent to `2md.site`. No URLs, no page content, no
personal data. See [privacy-policy.html](../privacy-policy.html).

The rendered preview is sanitized with DOMPurify, and HTML tags found in
captured text are escaped rather than rendered.

## Technical profile

Manifest V3, no runtime dependencies loaded from the network. The content
script bundle is ~275 KB, dominated by the complete WHATWG entity table and the
conversion core; the side panel bundle is larger because it embeds KaTeX.
Conversion is [htmltodotmd](https://github.com/andryushkin/htmltodotmd);
preview is marked + DOMPurify; math is KaTeX; icons are inline Lucide-style
SVG.
