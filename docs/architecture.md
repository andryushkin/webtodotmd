# Architecture

Manifest V3 extension with four surfaces — content script, side panel, service
worker, options page — sharing a small module layer under `src/shared/`. The
HTML → Markdown conversion is the `core/` package — the `htmltodotmd` library,
developed here and published from here; the content script imports it from
source (`core/src/browser.ts`), so there is no build step between the two.

The conversion escapes Markdown syntax that came from the page as text, so the
file renders what the reader saw rather than turning `**bold**` in a tutorial
into bold. `core/src/core/escape.ts` splits this in three on purpose: inline
marks are safe per text node; `#`, `>`, bullets and numbering depend on starting
a line, which only the text node opening a block does — a block the tag says, or
one a `display` does, since `convert()` writes such an element between blank
lines too; and HTML — a `<` that could open a tag, an `&` that could complete a
character reference — is escaped because Markdown carries raw HTML through, so a
page *about* HTML would lose the text it was showing.

A tilde is the exception among the inline marks, because one alone is not a mark
at all. It is escaped only where a partner can reach it: another tilde in the
same node that CommonMark's flanking rules let pair with it, or one the line
writes beside it — the `~~` a `<del>` emits. `~` in front of a struck run made
`~~~x~~`, which is a tilde code fence, and the text left the page rather than
gaining a stray marker; `~/src` and `~5 min` pay nothing, and neither does a pair
that cannot close, as in `~/src and ~/usr`.

That last pass only works because `sanitize()` calls `normalize()` last: a parser
hands `&lt;/td&gt;` over as three adjacent text nodes, each harmless on its own,
and the escaper decides one node at a time. Merging them is what lets it see the
construct at all.

Merging reaches only *adjacent* text nodes, though, and syntax highlighting puts
an element between them — `<span>&lt;</span>img src=…&gt;` is two strings that
each pass their own check and assemble into a tag. Since the second string does
not exist yet when the first is escaped, a node ending mid-construct — a bare
`<`, or an `&` and half a character reference — is escaped on suspicion instead.
`lookAhead()` in the parser is what limits the suspicion to nodes that
something is actually joined onto, which is why `<h2>Q&amp;A</h2>` keeps its
ampersand bare.

Emphasis runs the same argument in reverse. CommonMark decides whether `*` or `_`
opens emphasis from the characters on either side, so `core/src/utils/flanking.ts`
reads those from the DOM and picks the first marker that will actually render —
`_`/`**`, then `*`/`__`, then `<em>`/`<strong>`/`<del>`, which have no flanking
rules. The preferred marker is kept wherever it works, so ordinary pages produce
the source they always did; the tag is the last resort for content that begins or
ends in punctuation and sits against a word, and for an element whose neighbour is
another emphasis element — two adjacent runs would otherwise merge their
delimiters into one. Adjacent code spans are merged into a single span for the
same reason, since a code span has no tag to fall back to that would keep its
content inert.
Those tags are declared in `core/src/fallback-tags.ts` alongside the table set —
the library's public statement of what markup it can emit, for consumers that
have to tell its output from a page's text.

The same question — which language is being written — is what `outputContext`
answers. Inside a cell of the HTML table fallback it is `'html'`, and emphasis,
inline code and links emit tags rather than Markdown that the surrounding HTML
block would never parse. It replaced a boolean `escapeSyntax: false`, which said
only half of it: escaping stopped, but the rules kept writing `**bold**` into
markup that showed the reader asterisks.

A page states its formatting in two languages, and only one of them is a tag.
`core/src/utils/inline-style.ts` reads the other — the `style` attribute — for
the properties that change what a reader sees as text: `font-weight`,
`font-style`, `text-decoration`, and `display` for where the line ends.
Deliberately an attribute: the core is isomorphic, its tests run against
linkedom and the extension converts a detached clone, so `getComputedStyle`
exists in neither and a rule that needed it would hold in one half of the
product only.

The rule is not "weight ≥ 600 means bold". A heading, a table header and a
`<strong>` are already bold, and every one of them is routinely handed the weight
it already has — by a CMS, by a paste from a word processor, by a theme — so the
module works out two faces for each element: the one its style declares, and the
one it would have had without the declaration. A mark is written only where the
first beats the second, which is what keeps `**` out of a `##` and stops a
`<strong style="font-weight:700">` writing its delimiters twice. The comparison
runs the other way too: `<strong style="font-weight:normal">` is not bold on
screen, so the tag's mark is dropped and its text kept. Everything is emitted
through `emphasis()`, the same function the tag rules use, so a style-derived
mark picks its marker by the same flanking rules and becomes a `<strong>` tag
inside the HTML table fallback without a word of its own.

Most of the web states its formatting through a class, though, and a class says
nothing to a clone — which made Tailwind, Notion, Medium, Substack and Confluence
pages convert as unformatted text. `src/content/style-snapshot.ts` is the other
half of the answer: it holds live nodes for the length of a capture and writes
the computed style of everything whose face — its weight, its slant, its line,
the box it makes, the edge it lines up against — differs from what its tag and
its parent already imply into a `data-s2md-style` attribute, in ordinary CSS
declarations. `elementStyle()` joins the two — the snapshot is the later word,
since a computed style already has the inline one folded into it, and silence in
it is not a denial. No snapshot is the ordinary case rather than an error:
`server.ts` and every other caller of the library convert without one, and the
`style` attribute is read exactly as it was before.

Recording a *change* of face rather than a face is what lets the attribute
survive being cut out of the page. A run whose weight came from a paragraph the
selection left behind carries no claim of its own, so no `**` is invented for it;
a `<span>` inside a bold heading is silent for the same reason, which is the rule
above restated against a stylesheet. The walk collects everything before it
writes anything — setting an attribute invalidates the style the browser has
cached, so a walk that wrote as it went would recalculate once per element — it
stops at `display:none` instead of marking a hidden menu one node at a time, and
it descends into `shadowRoot`, since `expandShadowRoots()` flattens a component
by copying `innerHTML` and attributes are the only thing that copy carries.

Silence has two exceptions. The first is the only way the snapshot can take
something back rather than add to it. The core falls back on the page's own
`style` for every property the snapshot says nothing about, so where the cascade
overruled that attribute — an `!important` rule lifting a `display:none`, a
stylesheet transition turning an `opacity:0` into a reveal — the computed value
is written down explicitly. Left unsaid, the attribute decides alone, and what it
decides is to delete the element with everything under it.

The second adds rather than retracts, and it comes in a pair: a box the cascade
makes invisible while something under it is visible again says
`visibility:hidden`, and the descendant that takes the property back says
`visibility:visible`. The core keeps such a box for that descendant's sake and
drops the text the box holds itself, which it can only do if it is told both
halves — one mark alone would have it delete the box and the visible text with
it.

Several places read the same declarations for their own questions: `isHidden()`
in the sanitizer, which drops `display:none`, `visibility:hidden|collapse` and
`opacity:0` before anything is converted; `endsLine()` in the flanking module,
since a `display:block` on a `<span>` ends a line as surely as a `<br>`;
`getAlignment()` in the table rule, which is what carries a column aligned by a
class into the separator row; and the parser, where `convert()` decides the box
both ways round — `block` on an inline tag wraps the rule's output in blank
lines, `inline` on a block tag returns the content instead of running the rule —
while `opensBlock()` and the lookahead ask the same question so that the text of
a styled block is escaped as the start of a line. Each of those is gated on the
raw attribute mentioning the property, so an element carrying only a `color`
costs no more than one carrying no style at all. `isHidden()` also drops the
shapes `.sr-only` and `.visually-hidden` are built from — a zero `clip` rect,
`clip-path: inset(50%)` or deeper, a four-digit negative `text-indent` or offset,
a one-pixel box that clips — because the text under them was written for a screen
reader and no reader ever saw it. Each threshold sits where no layout lands by
accident: the mistake that costs here is deleting text a person saw, not keeping
text they did not.

Two of the verdicts therefore hold back. An `opacity: 0` with a transition or an
animation over it is a section on its way in rather than one withheld, and
`visibility` is the one property a descendant can declare back — so a hidden box
holding something visible again survives, and only the parts of it still hidden
are removed. The snapshot settles that mark on the way *out* of its walk, once it
knows what the subtree holds; deciding in document order left a hidden paragraph
standing whenever a visible sibling happened to follow it.

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
2. The content script records the computed style of the selection's scope
   (`snapshotStyles()`), then expands shadow roots (`expandShadowRoots()`),
   injecting their contents as temporary `<s2md-shadow>` elements so web
   components convert like ordinary markup. That order is the point: the
   snapshot has to be read before anything mutates the DOM, and its attributes
   have to be on the shadow nodes before their `innerHTML` is copied out. Both
   cleanups run in `finally` blocks, and both restore the page's own value for
   the attribute rather than removing it.
3. `selectionToMarkdown()` converts the selection. Multiple ranges
   (`rangeCount > 1`) are converted separately and joined with `\n\n`.
   `Range.cloneContents()` already closes whatever tags the selection cut
   through, so the work here is the opposite one: restoring context the
   selection left behind. A range inside a `<pre>`, a heading, a list item, a
   blockquote or a table is rebuilt with that wrapper — the table's header row,
   the code block's `data-lang`, and the ordinal the selected list item actually
   had, not the list's `start`. The wrapper and the header restoration compose:
   two tables inside a quoted block come back as two tables, each with its header. A range that *crosses
   out* of a table has no semantic common ancestor at all (drag from the last
   rows into the paragraph below and it is a plain `<div>`), so table headers are
   restored separately, for every table the fragment carries. Clones keep no link
   to their originals, so the originals are marked before cloning — and the mark's
   previous value is restored in a `finally`, because the page may have been using
   that attribute name itself.
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
captured text would render too. That is handled in the core, where the origin of
the text is still known, rather than in the panel.

There used to be a second pass here, `escapeHtmlTagsInMarkdown()`, which walked
the finished Markdown and escaped tags that were not the core's own output. It
could only tell the two apart by re-parsing the string against an allow-list of
what the core emits, so it drifted in both directions: prose about HTML slipped
through shapes the list did not model, and the core's own multi-backtick spans and
emphasis tags were escaped into visible entities. It is gone. `core/src/core/escape.ts`
escapes `<` and `&` in page text, literal contexts are inert by construction (a
fence, a code span, or the `<code>` wrapper `kbd`/`samp` now get), and LaTeX has
`escapeMathTags()`, which neutralizes only a `<` that begins a tag or a comment so
that `a < b` survives. `tests/fidelity/no-live-markup.test.ts` holds that line:
every context that emits text is listed there, and a new one has to be added
before it can be trusted.

`DOMPurify.sanitize()` still runs before `innerHTML`, and is still required.

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
app, so the panel sets `btnEditmd.hidden` from the UA platform hint at module
scope — synchronously, before first paint, because awaiting
`chrome.runtime.getPlatformInfo()` would make the button appear or disappear
after the toolbar is already on screen. The node always exists, so no call site
needs a guard, and `updateToolbarDensity()` skips children with no
`offsetParent` so a hidden button cannot be mistaken for the top row.

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

`bun test` runs both suites: the extension's under `src/**/__tests__/` and the
conversion core's under `core/tests/`. Conversion behavior belongs in the
latter — `src/content/__tests__/conversion.test.ts` covers only what the
extension itself depends on.

## Two Chrome behaviors worth remembering

- `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` makes
  Chrome swallow the icon click, so `chrome.action.onClicked` never fires — and
  Chrome **persists** the value across extension reloads. The service worker
  therefore sets it to `false` explicitly on every start.
- `host_permissions: ["*://*/*"]` is intentionally absent from the manifest:
  it makes store review flag broad host permissions. `content_scripts.matches`
  covers auto-injection and `scripting` + `activeTab` cover the on-demand path.
