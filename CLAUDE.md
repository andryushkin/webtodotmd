# Text to .md — working guide

Manifest V3 Chrome extension that converts a page selection to Markdown.
Surfaces: content script (capture), side panel (main UI), service worker
(coordination), options page. Conversion itself is not in this repository — it
comes from [htmltodotmd](https://github.com/andryushkin/htmltodotmd), the
`vendor/htmltodotmd` submodule.

Domain documentation lives in `docs/` (`docs/README.md` is the index) — read
the file matching your task before changing that area, and update it in the
same change when you alter behavior it describes.

## Project map

- `src/content/` — `content-script.ts` (selection capture, highlighter mode,
  floating bubble, Shadow DOM flattening), `page-title.ts`, `html-entities.ts`
  (generated), `highlight-target.ts`.
- `src/sidepanel/` — the main UI: preview/source, toolbar, status bar, rating.
- `src/background/service-worker.ts` — context menu, commands, panel behavior,
  install/update pages.
- `src/settings/` — options page.
- `src/shared/` — i18n, icons, settings store, injection, messaging,
  telemetry, identity.
- `public/_locales/` — 52 locales; must stay under `public/` to reach `dist/`.
- `vendor/` — marked, DOMPurify, KaTeX, mathml-to-latex, and the
  `htmltodotmd` submodule.

## Build and test

```bash
bash build.sh     # → dist/, no node_modules needed
bun install       # once, for linkedom
bun test src      # not bare `bun test` — that runs the submodule's suite too
```

Bun is the transpiler; there is no bundler config. Packaging and store steps
are in `docs/releasing.md`.

## Invariants

**Side panel**

- `rawMd: string` is the single source of truth, never `textarea.value`.
  Update through `setContent(md)`; Copy always reads `rawMd`.
- `DOMPurify.sanitize()` before any `innerHTML`. marked runs with `html: true`
  (injected KaTeX/metadata blocks must render), so
  `escapeHtmlTagsInMarkdown()` runs first on captured text.
- Status: `setBaseStatus()` for readiness, `setTempStatus()` for errors and
  confirmations. Do not call `setStatus()` directly; it uses `innerHTML`, so
  messages go through `escHtml()`.
- `setButtonContent()` always sets `aria-label` — in compact mode the visible
  label is gone. `updateToolbarDensity()` measures in the non-compact state,
  which is what keeps it from oscillating.

**Content script**

- Never import `src/shared/i18n.ts` there — fetching locale files is
  unreliable. Translations arrive via `chrome.storage.local` (`contentI18n`),
  written by the service worker.
- Never pass service worker → content script data with
  `chrome.runtime.sendMessage`: the panel and the worker both listen and
  compete. Use `chrome.storage.local`.
- Bubble visibility is `style.display` only. `element.hidden` does not work —
  the inline `display:inline-flex` in `style.cssText` overrides the UA
  `[hidden]` rule.
- `expandShadowRoots()` must be wrapped in try/finally so its cleanup always
  runs.

**Entities and titles**

- `html-entities.ts` is generated from the WHATWG table — do not hand-edit, and
  do not trim it. The decoder matches longest-first, so a partial table makes
  `&notin;` collapse to `¬in;` via legacy `&not`.
- Truncate titles by grapheme (`Intl.Segmenter`), never `slice()`.
- Entity behavior cannot be tested through the DOM (linkedom does not decode);
  tests compare against the reference table.

**Chrome quirks**

- Always call `setPanelBehavior({ openPanelOnActionClick: false })` explicitly
  on service worker start — Chrome persists `true` across reloads and then
  `chrome.action.onClicked` never fires.
- Do not add `host_permissions: ["*://*/*"]` to the manifest; store review
  flags it. `content_scripts.matches` + `scripting`/`activeTab` are enough.

**Testability**

Functions needing tests go in their own module — `content-script.ts` cannot be
imported by a test because of its top-level Chrome API calls.

**Localization**

New UI strings go into all 52 locales at once, not just `en`. The completeness
check is in `docs/releasing.md`.

## Conventions

- Commit messages: `feat`, `fix`, `refactor`, `docs`, `chore`.
- Public-facing text in the repository — README, docs, comments, commit
  messages — is English.
