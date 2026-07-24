# Text to .md documentation

Project documentation written for two audiences at once: people reading the
repository and AI agents working in it. Each file describes **stable facts**
about one domain — what exists, how it fits together, and which contracts must
not be broken.

## Map

| File | Domain |
| --- | --- |
| [architecture.md](architecture.md) | Extension surfaces, the capture pipeline, messaging, storage, i18n |
| [features.md](features.md) | What the extension does, from a user's point of view — capture modes, side panel, settings |
| [localization.md](localization.md) | Localization spec: brand voice, per-locale rules, what must never be translated |
| [releasing.md](releasing.md) | Build, package, and Chrome Web Store submission |
| [audit.md](audit.md) | Public-repository gate: mechanical checks and reviewer judgment |
| [permissions-justification.md](permissions-justification.md) | Why each manifest permission exists (written for store review) |
| [website-welcome-changelog.md](website-welcome-changelog.md) | Contract with 2md.site for the install/update pages |

## Other contents

- `lang/description/` — Chrome Web Store long descriptions, one file per
  locale. They go into the Developer Dashboard by hand; `_locales/` does not
  cover store listings.
- `img/` — store assets (icon, banner) and screenshots.
- `test_tomd_page.html` — a kitchen-sink page (tables, math, code, nested
  lists, Shadow DOM) for manually checking conversion output.
