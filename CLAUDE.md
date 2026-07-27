# Text to .md — working guide

Manifest V3 Chrome extension that converts a page selection to Markdown. The
conversion core lives in `core/` — the `htmltodotmd` library, developed in this
repository and published from it, not a third-party dependency.

Domain docs are in `docs/` (`docs/README.md` is the index). Read the one
matching your task before changing that area, and update it in the same change
when you alter behavior it describes.

## Project map

| Path | Contents |
| --- | --- |
| `src/content/` | Selection capture, highlighter mode, floating bubble, Shadow DOM flattening; plus `page-title.ts`, `highlight-target.ts`, `style-snapshot.ts`, generated `html-entities.ts` |
| `src/sidepanel/` | Main UI: preview/source, toolbar, status bar, rating |
| `src/background/` | Service worker: context menu, commands, panel behavior, install/update pages |
| `src/settings/` | Options page |
| `src/shared/` | i18n, icons, settings store, injection, messaging, telemetry, identity |
| `public/_locales/` | 52 locales; must stay under `public/` to reach `dist/` |
| `core/` | `htmltodotmd`: the HTML → Markdown library — rules, parser, its own tests and build |
| `vendor/` | marked, DOMPurify, KaTeX, mathml-to-latex |

## Build and test

```bash
bash build.sh     # → dist/, no node_modules needed
bun install       # once: linkedom for tests, plus the core package's toolchain
bun test          # extension and core, one runner
scripts/audit.sh  # public-repo gate, before pushing (docs/audit.md)
```

Bun is the transpiler for the extension — no bundler, no config. `core/` has a `tsup` build of its
own, used only to publish the library. Packaging and store steps are in `docs/releasing.md`.

## Invariants

Each of these has cost a bug already; the reason is what makes it stick.

**Conversion core (`core/`)**

- Markdown characters in the page's own text are escaped, so the file renders what the reader saw.
  Inline marks (`*`, a non-intraword `_`, `` ` ``, tildes, link brackets, the last two against a
  bounded lookahead) are escaped per text node; `#`, `>`, bullets, numbering and a line of dashes only
  in the node that opens a block — a text node is not a line, and the parser splits text at every
  element boundary. Never escape inside `pre`, `code`, `kbd`, `samp` or a math subtree: a backslash
  there is corruption, and in a math subtree only a tag start (`<` before a letter or slash) is
  neutralized, because that is what can close a fallback cell.
- A `~` is escaped when a partner can reach it, never for standing at an edge. One tilde renders as
  itself, so the question is whether a second can pair with it: another in this node that flanking
  lets close what it opens (`1~5 and 7~9` pays, `~/src and ~/usr` does not — both open, neither
  closes), or one the line writes beside it, which is the `~~` of a `<del>`. `~` before a struck `x`
  made `~~~x~~`, a tilde code fence, and `x` left the page — the only defect the survey has found
  that costs content rather than characters. Both halves of a pair pay or neither does: a backslash
  does not stop marked closing a `<del>` on the escaped one. `~/src`, `~5 min`, a `<td>~</td>` and a
  `## ~/home` pay nothing.
- HTML in page text is escaped too (`\<`, `\&`), just as narrowly. Two halves must not assemble across
  a node boundary: `sanitize()` calls `normalize()` last, and a node whose tail is still an open
  construct escapes it defensively, since it cannot see what the next node adds.
- Emphasis picks the first marker CommonMark's flanking rules let render: `_`/`**`, then `*`/`__`,
  then an HTML tag (`core/src/utils/flanking.ts`). Content starting or ending in punctuation, pressed
  against a word, has no marker that works — emitting one lost the italics and left the characters.
- A style mark is what is *heavier than its context*, never a large `font-weight`
  (`core/src/utils/inline-style.ts`): a heading, a `<th>` and a `<strong>` are already bold and are
  routinely handed the weight they have, so `**` inside a `##` is what the naive rule writes. It runs
  both ways — a style declining its tag's mark drops it — and emits through `emphasis()` like every
  other mark.
- `display` is decided in `convert()` and nowhere else, both ways round: `block` on an inline tag
  wraps the rule's output in blank lines, `inline` on a block tag returns the content instead of
  running the rule. A styled block *opens a line*, so `opensBlock()` and every lookahead must ask
  about it too — while only the tag was asked, `<span style="display:block"># heading</span>` put a
  real H1 in the file. Only tags whose whole output is content between blank lines can decline one:
  a `<br>` carries `display:inline` in every computed style there is, and a `<table>` writes a grid.
- The core reads attributes, never `getComputedStyle`, because it is isomorphic: `style`, and beside
  it `data-s2md-style`, a computed style the content script recorded while it still had live nodes.
  `elementStyle()` joins them — the snapshot is the later word, silence in it is not a denial — and
  one parser and one set of property readers answer both, so neither side can invent a spelling the
  other has to be taught. Every question about a style goes through it: `getAlignment` had a regex of
  its own and a column aligned by a class lost its `---:`. No snapshot is the ordinary case:
  `server.ts` and every library caller convert without one, and behavior must survive its absence.
  Gate on what a style *says*, not that there is one — `color` and `margin` are most of what a page
  writes inline and change no character of the output, so `statesConversion()`/`statesDisplay()` come
  before any parse or ancestor walk.
- Any lookup keyed by a tag name or a CSS value is a `Map`, never an object literal: the page picks
  the key, and `EMPHASIS_TAGS['constructor']` answered with `Object` — truthy, so an unknown
  `<constructor>` element read as an emphasis wrapper and the `<em>` beside it gave up its `*`.
- `hiddenByStyle()` also drops what is drawn where nobody can look: a zero `clip` rect, `clip-path:
  inset(≥50%)`, a four-digit negative `text-indent` or offset, a 1×1 box that clips. That is how
  `.sr-only` and `.visually-hidden` are written, and the text under them was meant for a screen
  reader alone. Every threshold is set where no layout lands by accident — the expensive mistake here
  is deleting text a person saw, not keeping text they did not.
- Which is why two of those hold back. An `opacity: 0` under a transition or an animation is a
  section on its way in, not one withheld, and reveal-on-scroll libraries put it on half an article;
  `revealsFrom()` reads the shorthand and the longhands, because an attribute writes one and a
  computed style the other. And `visibility` is the one a descendant can take back — removal takes
  the subtree, so a hidden box holding something declared visible again stays, and what is still
  hidden inside it says so for itself.
- A `visibility:hidden` under a transition is either kind, written identically: a section a reveal
  library has not animated in, or a dropdown standing by. The box tells them apart — an overlay must
  leave the flow or it would hold space open while closed — so `absolute`/`fixed` is removed and
  anything in the flow stays. Judged wrong one way the file loses a menu, the other way the article.
- A pipe table states alignment once per column, and the page may say it in either row. The header
  answers first; when it is silent the body does, but only unanimously — a table of numbers carries
  `text-align` on every `<td>` and nothing on the `<th>`, while one differing or silent cell means
  the column was never aligned at all.
- The HTML table fallback sets `outputContext: 'html'` for its cells: an HTML block is not parsed as
  Markdown, so escaping shows backslashes *and* `**bold**` shows asterisks. Emphasis, code and links
  emit tags; an image emits alt text, since allowing `src`/`alt` past the preview's allow-list would
  widen it for a case that already rendered nothing. A link's scheme is checked.

**Side panel**

- `rawMd: string` is the single source of truth, never `textarea.value`. Update
  through `setContent(md)`; Copy always reads `rawMd`.
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

**Selection**

- `cloneContents()` already closes cut tags; the work is restoring what the
  selection left behind. A range crossing *out* of a table has no semantic common
  ancestor, so table headers are restored separately. Clones carry no link to
  originals: mark before cloning, unmark in a `finally`, and detect the header by
  that mark — comparing `textContent` promoted a body row that repeated it. The
  page may own the attribute, so restore its value in the `finally`, not remove.

**Content script**

- Never import `src/shared/i18n.ts` here — fetching locale files is unreliable
  in a content script. Translations arrive via `chrome.storage.local`
  (`contentI18n`), written by the service worker.
- Never send service worker → content script data with
  `chrome.runtime.sendMessage`: the panel and the worker both listen and
  compete. Use `chrome.storage.local`.
- Bubble visibility is `style.display` only. `element.hidden` does nothing —
  the inline `display:inline-flex` overrides the UA `[hidden]` rule.
- Wrap `expandShadowRoots()` in try/finally so its cleanup always runs.
- `snapshotStyles()` (`style-snapshot.ts`) is the only `getComputedStyle` in the
  product. It runs before any DOM mutation and writes nothing while it walks —
  setting an attribute invalidates Chrome's style cache, so a walk that wrote as
  it went would pay for a recalculation per element. It records only what the tag
  and the parent do not already imply, which is both what keeps the markup small
  and what lets a run cut out of its bold paragraph stay plain. It walks
  `shadowRoot` too: `expandShadowRoots()` copies `innerHTML`, which carries
  attributes and nothing else, so a component not snapshotted first arrives
  unstyled for good. Marks come off in a `finally`, restoring the page's value.
- That silence has one exception, and it is the only way the snapshot can *take
  something back*: where the page's own `style` hides an element and the cascade
  overruled it, the computed value has to be written down, because the core falls
  back on the attribute wherever the snapshot says nothing. Same reason a
  `visibility:hidden` mark is settled on the way *out* of the walk — until the
  subtree has been read, nothing knows whether something below is visible, and
  deciding in document order kept a hidden paragraph whenever a visible sibling
  happened to follow it.
- Anything that needs a test goes in its own module: `content-script.ts` cannot
  be imported by a test, because of its top-level Chrome API calls.

**Entities and titles**

- `html-entities.ts` is generated from the WHATWG table — never hand-edit or
  trim it. The decoder matches longest-first, so a partial table makes
  `&notin;` collapse to `¬in;` via the legacy `&not` name.
- Truncate titles by grapheme (`Intl.Segmenter`), never `slice()`, which splits
  emoji sequences that then reach the front matter and the filename.
- Entity behavior cannot be tested through the DOM — linkedom does not decode
  entities; tests compare against the reference table.

**Chrome quirks**

- Call `setPanelBehavior({ openPanelOnActionClick: false })` explicitly on every
  service worker start. Chrome persists `true` across reloads, and then
  `chrome.action.onClicked` never fires.
- Do not add `host_permissions: ["*://*/*"]`; store review flags it.
  `content_scripts.matches` plus `scripting`/`activeTab` already cover both
  injection paths.

## Conventions

- A new UI string means a new key in all 52 locales, not just `en`; the
  completeness check is in `docs/releasing.md`.
- Commit messages: `feat`, `fix`, `refactor`, `docs`, `chore`.
- Everything written in the repository — docs, comments, commit messages — is
  in English.
