# Text to .md documentation

Project documentation written for two audiences at once: people reading the
repository and AI agents working in it. Each file describes **stable facts**
about one domain — what exists, how it fits together, and which contracts must
not be broken.

## Map

| File | Domain |
| --- | --- |
| [conversion.md](conversion.md) | What converts into what: the complete HTML → Markdown map, and what deliberately converts to nothing |
| [architecture.md](architecture.md) | Extension surfaces, the capture pipeline, messaging, storage, i18n |
| [features.md](features.md) | What the extension does, from a user's point of view — capture modes, side panel, settings |
| [localization.md](localization.md) | Localization spec: brand voice, per-locale rules, what must never be translated |
| [releasing.md](releasing.md) | Build, package, and Chrome Web Store submission |
| [audit.md](audit.md) | Public-repository gate: mechanical checks and reviewer judgment |
| [website-welcome-changelog.md](website-welcome-changelog.md) | Contract with 2md.site for the install/update pages |

## Other contents

- `test_conversion_spec_page.html` — a case-by-case manual fixture for the full
  `conversion.md` contract, with simple examples, regression-derived edge cases,
  real-world composites, partial-selection enrichment, full-mode chrome removal,
  and known limitations clearly separated from expected passes. Serve it over
  HTTP — the extension cannot run on `file://`.

## Not in this repository

Chrome Web Store material — listing copy and its translations, screenshots,
banner sources, and the permissions justification written for store review —
lives in a gitignored `store/` directory. It is Developer Dashboard input
rather than part of the extension, and `public/_locales/` does not cover store
listings.
