# Architecture

Manifest V3 extension with four surfaces — content script, side panel, service
worker, options page — sharing a small module layer under `src/shared/`. The
HTML → Markdown conversion itself is not part of this repository: it lives in
[htmltodotmd](https://github.com/andryushkin/htmltodotmd), pulled in as the
`vendor/htmltodotmd` submodule and compiled into the content script.

## Surfaces

| Surface | Entry point | Role |
| --- | --- | --- |
| Content script | `src/content/content-script.ts` | Reads the selection, runs the conversion, owns highlighter mode and the floating bubble |
| Side panel | `src/sidepanel/sidepanel.ts` | The main UI: preview/source, toolbar, status bar, rating |
| Service worker | `src/background/service-worker.ts` | Context menu, keyboard commands, panel behavior, install/update pages |
| Options page | `src/settings/settings.ts` | Settings, registered as `options_page` |

## The capture pipeline

1. The side panel (or a command handler) calls `ensureContentScript(tabId)` —
   a PING, and an on-demand `scripting.executeScript()` if nothing answers.
   The manifest also auto-injects on `*://*/*`; the ping path covers tabs that
   loaded before the extension did.
2. The content script expands shadow roots (`expandShadowRoots()`), injecting
   their contents as temporary `<s2md-shadow>` elements so web components
   convert like ordinary markup. The cleanup function it returns runs in a
   `finally` block.
3. `selectionToMarkdown()` converts the selection. Multiple ranges
   (`rangeCount > 1`) are converted separately and joined with `\n\n`.
4. On success the script calls `removeAllRanges()`, so a second capture with
   nothing selected reports `NO_SELECTION` instead of repeating the last
   result.

Highlighter mode replaces step 3: clicked block elements are collected, and
`captureHighlightsMd()` builds a synthetic selection per element and joins the
results. `findHighlightTarget()` (`src/content/highlight-target.ts`) walks up
to the nearest block element, stopping at `BODY`/`HTML` by tag name.

## Page titles

`findPageTitle()` takes the first non-empty of `og:title` → `twitter:title` →
JSON-LD `headline` → `meta[name=title]` → `document.title`, then runs it
through `normalizePageTitle()` (`src/content/page-title.ts`).

Site metadata is frequently **double-encoded**: a page serves
`content="10&amp;nbsp;items"`, the parser decodes the attribute once, and
`getAttribute()` hands back a literal `&nbsp;`. So `normalizePageTitle()`
decodes entities **one more level**, folds NBSP/BOM into ordinary spaces (the
title also becomes a filename), and truncates to 200 code units.

`decodeEntities()` follows the HTML tokenizer: longest match wins, case is
significant, and decoding is single-pass (`&amp;lt;` → `&lt;`, not `<`).
`src/content/html-entities.ts` is generated from the WHATWG table and **must
stay complete** — with a truncated table `&notin;` does not merely fail to
decode, it collapses to `¬in;` via the legacy `&not` name. Truncation of the
final title is done by grapheme cluster (`Intl.Segmenter`, falling back to code
points), never `slice()`, which would split an emoji ZWJ sequence and send a
broken character into the front matter and the filename.

## Messaging and storage

Message types live in `src/shared/messaging.ts`. Two conventions matter:

- **Service worker → content script data goes through
  `chrome.storage.local`, not `chrome.runtime.sendMessage`.** The side panel
  and the service worker both register `onMessage` listeners and would
  compete. Translations for the floating bubble travel this way, under the
  `contentI18n` key.
- **Auto-capture is a storage signal.** Clicking the toolbar icon opens the
  panel and writes `{ captureSignal: Date.now() }` to
  `chrome.storage.session`; the panel listens for the change and calls
  `captureSelection(true)`. It also reads the key once at startup, for the
  race where the panel opened after the write.

Highlighter mode is switched off by a **port disconnect**: the panel opens a
`chrome.runtime.connect()` port, and the content script treats
`port.onDisconnect` as "panel closed, leave highlighter mode". Tab switches
disconnect the port explicitly.

## Side panel state

`rawMd: string` is the single source of truth for the note — never
`textarea.value`. `setContent(md)` updates the string, the rendered div and the
source textarea together; Copy always reads `rawMd`.

The preview runs marked with `html: true` so injected blocks (KaTeX output,
metadata block, content gaps, `sub`/`sup`) render — which means literal tags in
captured text would render too, so `escapeHtmlTagsInMarkdown()` runs first and
escapes tags outside code spans (`sub`, `sup`, `br` excepted). `DOMPurify
.sanitize()` is mandatory before any `innerHTML` assignment.

The status bar has two layers: `setBaseStatus()` for the persistent readiness
line and `setTempStatus()` for transient errors and confirmations, which fall
back to the base message. Readiness is recomputed on `tabs.onActivated`,
`tabs.onUpdated` and at the end of `init()` — restricted tabs (PDF, `file://`,
`chrome://`, empty) get a warning instead of "Ready to capture".

The toolbar collapses to icons only when it no longer fits:
`updateToolbarDensity()` measures the real layout in the non-compact state and
adds a `compact` class if anything wrapped, so there is no oscillation. In
compact mode the visible label is gone, so `setButtonContent()` always sets
`aria-label`.

One toolbar button is platform-conditional: **Send to EditMD** targets a macOS
app, so it is `display: none` by default and revealed by a `platform-mac` class
that `init()` puts on `<body>` after `chrome.runtime.getPlatformInfo()`. The
node always exists — the button code needs no null checks — and the class is
set before the first `updateToolbarDensity()`, so the measurement matches what
the panel actually shows.

## i18n

`public/_locales/` holds 52 locale directories, and the manifest name and
description use `__MSG_*` placeholders. The panel and the options page go
through `src/shared/i18n.ts` (`initI18n(uiLanguage)` + `t(key)`), which honors
the `uiLanguage` setting rather than the browser language; the default is
`'en'`, not `'auto'`.

The content script deliberately does **not** import `i18n.ts` — fetching locale
files is unreliable there. It reads translations the service worker wrote to
`chrome.storage.local` and falls back to `chrome.i18n.getMessage()`.

RTL locales (`ar`, `he`, `fa`, `ur`) set `dir="rtl"` on `<html>`, while content
areas carry `dir="auto"` so captured text picks its own direction. CSS uses
logical properties (`border-inline-start`, `text-align: start`) throughout.

## Build

`build.sh` runs four `bun build` invocations (service worker, content script,
side panel, settings), copies the HTML/CSS while rewriting `.ts` references to
`.js`, patches the same references in `manifest.json`, and copies `public/`
into `dist/`. There is no bundler config and no `node_modules` in the build
path — only tests need an install, for `linkedom`.

`_locales/` must live under `public/`, because that is what `build.sh` copies.

## Testing

Tests run on Bun with linkedom as the DOM. Functions that need testing are kept
out of `content-script.ts` — its top-level Chrome API calls make it
unimportable — which is why `highlight-target.ts`, `page-title.ts` and the
shared utilities are separate modules. Entity decoding cannot be tested through
the DOM at all (linkedom does not decode entities); those tests compare against
the reference table instead.

Run `bun test src`, not bare `bun test`, which would also run the submodule's
suite.

## Two Chrome behaviors worth remembering

- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` makes
  Chrome swallow the icon click, so `chrome.action.onClicked` never fires — and
  Chrome **persists** the value across extension reloads. The service worker
  therefore sets it to `false` explicitly on every start.
- `host_permissions: ["*://*/*"]` is intentionally absent from the manifest:
  it makes store review flag broad host permissions. `content_scripts.matches`
  covers auto-injection and `scripting` + `activeTab` cover the on-demand path.
