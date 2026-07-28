# Text to .md — project notes

Manifest V3 Chrome extension that converts a page selection to Markdown. The
conversion core lives in `core/` — the `htmltodotmd` library, developed in this
repository and published from it, not a third-party dependency.

This is the only guide that arrives on its own. Everything else — the invariant
sheets, the domain docs — is reached from here, so the routing is the first job
this file has.

## Open the sheet before you edit (HARD)

Every subsystem keeps its rules in `docs/invariants/`. Those files used to load
themselves whenever work happened in the directory they constrain; they no
longer do. Open the one covering the path **before the first edit under it**.
Each rule in them is a defect somebody already shipped — a capture arriving
empty, a paragraph per navigation link, a heading with nothing above it — and
nothing in the code says so; the sheet is where the reason lives.

| Path | Contents | Read first |
| --- | --- | --- |
| `core/` | `htmltodotmd`: the HTML → Markdown library — rules, parser, its own tests and build | `docs/invariants/core.md` — output language, escaping, emphasis and style, reading a style, whitespace, rows, hiding, maths, blocks, code, tables, the package |
| `src/content/` | Selection capture, highlighter mode, floating bubble, Shadow DOM flattening, style snapshot | `docs/invariants/content.md` — isolation from the extension, selection, hard breaks, the snapshot, entities and titles |
| `src/sidepanel/` | Main UI: preview/source, toolbar, status bar, rating | `docs/invariants/sidepanel.md` — `rawMd` as the source of truth, the heading base, sanitizing, status layers, toolbar density |
| `src/background/` | Service worker: context menu, commands, panel behavior, install/update pages | `docs/invariants/background.md` — panel behavior on worker start, permissions the store flags |
| `src/shared/` | i18n, icons, settings store, injection, messaging, telemetry, identity, restricted pages | — |
| `src/settings/` | Options page | — |
| `public/_locales/` | 52 locales; must stay under `public/` to reach `dist/` | `docs/localization.md` |
| `tests/fidelity/` | The round-trip oracle, its generator and the gate | — |
| `tests/real-pages/` | The same question asked of markup nobody here wrote | `tests/real-pages/README.md` |
| `vendor/` | marked, DOMPurify, KaTeX, mathml-to-latex | — |

A `PreToolUse` hook (`.claude/hooks/invariants.sh`, wired in
`.claude/settings.json`) pastes the matching sheet in the first time you edit
under one of those paths. It is a net under the rule, not the rule: it fires
only in Claude Code, only on an edit, and only once per session — planning,
reading and reviewing get nothing from it. Open the sheet yourself.

Domain docs — what converts into what, the surfaces, localization, the release —
are indexed in `docs/README.md`. Read the one your task touches, and update it in
the same change when you alter behavior it describes.

When sources disagree: the user's request, then the code and its tests, then this
file, then the docs. A doc that contradicts the code is a bug in the doc — fix it
in that same change instead of writing around it.

## Working norms

- **The reader is the judge.** Every conversion question resolves to what the
  person saw on the page. Not what the HTML said, not what CSS computed, not what
  is convenient to emit — what was on screen. Where those disagree, the screen
  wins, and the invariant sheets say why for each case that has come up.
- **Deleting text costs more than adding characters.** A stray backslash in the
  file is a blemish; a paragraph that silently did not survive the capture is a
  loss the user cannot even see to report. When a rule could go either way, err
  toward keeping.
- **A number is a claim.** Do not report a speedup, a defect count or a repair
  without the measurement beside it. The fidelity gate exists because "it looks
  fine" was wrong repeatedly.
- **Check a fix against the base, not against the story.** When a defect class
  disappears from the survey, confirm it is repaired rather than merely unreached;
  when one appears, confirm it fails on the previous commit too. Classes are keyed
  by their shrunk document, so repairing one lets the shrinker walk to another.
- **Do not reformat text you are not changing.** Line budgets are not a reason to
  rewrap someone else's paragraph — earn the space by saying less, or raise the
  budget.
- **A conversion bug belongs to `core/`.** Fix it there, with a test in
  `core/tests/`, rather than patching around bad Markdown in `src/`: the library
  is published from this repository, and a repair made in the extension leaves
  every other caller with the defect.

## Build and test

```bash
bash build.sh     # → dist/, bun and nothing else, no node_modules needed
bun install       # once: linkedom and happy-dom for tests, plus core's toolchain
bun test          # extension and core, one runner
bunx tsc --noEmit # bun checks no types; the audit runs this and the core's own
scripts/audit.sh  # public-repo gate, before pushing (docs/audit.md)
```

Bun is the transpiler for the extension — no bundler, no config. `core/` has a
`tsup` build of its own, used only to publish the library. Packaging and store
steps are in `docs/releasing.md`.

`bun test` cannot see the browser. Anything only Chrome exercises — the panel,
the highlighter, shortcuts, the service worker — is verified by loading `dist/`
unpacked in `chrome://extensions` and running it.

The fidelity gate holds a ceiling rather than zero: `bun tests/fidelity/survey.ts
200` prints the defect classes behind it, and `CEILING` and `RECORDED_CLASSES` in
`tests/fidelity/fidelity.test.ts` are where they are recorded. Both the count and
the class list, because a count alone cannot tell a repair from a swap.

## Keep in sync (HARD)

Each of these is a pair that has already drifted apart once. Changing one side
without the other is a defect, not a follow-up.

- **A new UI string ⇄ all 52 locales.** Not just `en`; the completeness check is
  in `docs/releasing.md`.
- **Behavior ⇄ the doc that describes it.** Same change, not a later one — and
  the invariant sheet for that subsystem, when the change is one of these rules.
- **Anything that emits text ⇄ `tests/fidelity/no-live-markup.test.ts`.** That
  file is the definition of the leak class it guards; a new emitter that is not
  in it is untrusted.
- **A conversion change ⇄ the fidelity ceiling.** Re-measure and record, in the
  same change, with the arriving and departing classes checked against the base.
- **A threshold in `core/` ⇄ the oracle that compares against it.** The oracle
  imports them for this reason; a second spelling desynchronises silently.
- **A release ⇄ version, `CHANGELOG.md` and tag.** One release, three places —
  `docs/releasing.md` has the order.

## Conventions

- Commit messages: `feat`, `fix`, `refactor`, `docs`, `chore`. Commit straight to
  `main`; do not open a branch for ordinary work, and do not push unless asked.
- Everything written in the repository — docs, comments, commit messages — is in
  English. The exceptions are `public/_locales/`, translations by definition, and
  the examples inside `docs/localization.md`.
- Check `git status --short` before you start and leave what was already dirty
  out of your commit; someone else's work is not yours to ship.
