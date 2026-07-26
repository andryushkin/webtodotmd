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
| `src/content/` | Selection capture, highlighter mode, floating bubble, Shadow DOM flattening; plus `page-title.ts`, `highlight-target.ts`, generated `html-entities.ts` |
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

Bun is the transpiler for the extension — no bundler, no config. `core/` has a
`tsup` build of its own, used only to publish the library. Packaging and store steps
are in `docs/releasing.md`.

## Invariants

Each of these has cost a bug already; the reason is what makes it stick.

**Side panel**

- `rawMd: string` is the single source of truth, never `textarea.value`. Update
  through `setContent(md)`; Copy always reads `rawMd`.
- `DOMPurify.sanitize()` before any `innerHTML`. marked runs with `html: true`
  so injected KaTeX and metadata blocks render, which means literal tags in
  captured text would render too — `escapeHtmlTagsInMarkdown()` runs first. Its
  allow-list (`src/shared/escape-html-tags.ts`, covered by tests) is exactly what
  the core emits: `sub`, `sup`, `br` and the table tags of the HTML fallback,
  and only bare or carrying a numeric `colspan`/`rowspan`. A tag name alone is
  not enough — `style` survives DOMPurify, so a literal `<table
  style="position:fixed">` in captured text would become an overlay.
- Status has two layers: `setBaseStatus()` for readiness, `setTempStatus()` for
  errors and confirmations. Never call `setStatus()` directly — it uses
  `innerHTML`, so messages must pass through `escHtml()`.
- `setButtonContent()` always sets `aria-label`: in compact mode the visible
  label is gone. `updateToolbarDensity()` measures in the non-compact state,
  which is what stops it oscillating.

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
