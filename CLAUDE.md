# Text to .md — project notes

Manifest V3 Chrome extension that converts a page selection to Markdown. The
conversion core lives in `core/` — the `htmltodotmd` library, developed in this
repository and published from it, not a third-party dependency.

Domain docs are in `docs/` (`docs/README.md` is the index). Read the one matching
your task before changing that area, and update it in the same change when you
alter behavior it describes.

## Working norms

- **The reader is the judge.** Every conversion question resolves to what the
  person saw on the page. Not what the HTML said, not what CSS computed, not what
  is convenient to emit — what was on screen. Where those disagree, the screen
  wins, and the invariant files say why for each case that has come up.
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

## Project map

| Path | Contents |
| --- | --- |
| `src/content/` | Selection capture, highlighter mode, floating bubble, Shadow DOM flattening, style snapshot |
| `src/sidepanel/` | Main UI: preview/source, toolbar, status bar, rating |
| `src/background/` | Service worker: context menu, commands, panel behavior, install/update pages |
| `src/settings/` | Options page |
| `src/shared/` | i18n, icons, settings store, injection, messaging, telemetry, identity |
| `public/_locales/` | 52 locales; must stay under `public/` to reach `dist/` |
| `core/` | `htmltodotmd`: the HTML → Markdown library — rules, parser, its own tests and build |
| `tests/fidelity/` | The round-trip oracle, its generator and the gate |
| `vendor/` | marked, DOMPurify, KaTeX, mathml-to-latex |

## Path-scoped invariants

One file per subsystem, all of them in `docs/invariants/`. **Nothing loads them
for you** — this is the only guide that arrives on its own, so open the one
covering the directory you are about to change, before you change it. Every rule
in them has cost a bug already, and the reason beside it is what makes it stick.

| Read this | Before touching | Covers |
| --- | --- | --- |
| `docs/invariants/core.md` | `core/` | Escaping, emphasis, reading a style, hiding, tables, maths, the package |
| `docs/invariants/content.md` | `src/content/` | Isolation from the extension, selection, the style snapshot, entities and titles |
| `docs/invariants/sidepanel.md` | `src/sidepanel/` | `rawMd` as the source of truth, sanitizing, status layers, toolbar density |
| `docs/invariants/background.md` | `src/background/` | Panel behavior on worker start, permissions the store flags |

## Build and test

```bash
bash build.sh     # → dist/, bun and nothing else, no node_modules needed
bun install       # once: linkedom for tests, plus the core package's toolchain
bun test          # extension and core, one runner
scripts/audit.sh  # public-repo gate, before pushing (docs/audit.md)
```

Bun is the transpiler for the extension — no bundler, no config. `core/` has a
`tsup` build of its own, used only to publish the library. Packaging and store
steps are in `docs/releasing.md`.

The fidelity gate holds a ceiling rather than zero: `bun tests/fidelity/survey.ts
200` prints the defect classes behind it. Both the count and the class list are
recorded, because a count alone cannot tell a repair from a swap.

## Keep in sync (HARD)

Each of these is a pair that has already drifted apart once. Changing one side
without the other is a defect, not a follow-up.

- **A new UI string ⇄ all 52 locales.** Not just `en`; the completeness check is
  in `docs/releasing.md`.
- **Behavior ⇄ the doc that describes it.** Same change, not a later one — and
  the invariant file for that subsystem, when the change is one of these rules.
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

- Commit messages: `feat`, `fix`, `refactor`, `docs`, `chore`.
- Everything written in the repository — docs, comments, commit messages — is in
  English.
- Commit straight to `main`; do not open a branch for ordinary work.
