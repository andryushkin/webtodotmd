# Side panel — invariants

The only surface the user reads the result on. What it shows and what the file
holds must be the same thing, which is where most of these come from.

Each rule below has cost a bug already; the reason is what makes it stick.

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
