# Changelog

Versions are the ones published to the Chrome Web Store.

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
