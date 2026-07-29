# HTML Text to .md

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/gkplehkbkofmdjhafgbclcmfcficoego?label=chrome%20web%20store)](https://chromewebstore.google.com/detail/gkplehkbkofmdjhafgbclcmfcficoego)
[![GitHub release](https://img.shields.io/github/v/release/andryushkin/webtodotmd?label=github%20release)](https://github.com/andryushkin/webtodotmd/releases/latest)

Chrome extension that turns what you selected on a page into clean Markdown.
The conversion runs inside the browser — the page content is never uploaded
anywhere, and there is no account to create.

The two badges are read live and are meant to be compared: the first is the
build the store is actually serving, the second is the build published here.
They drift whenever something is submitted and still in review, or a submission
was never made — which has happened, and was invisible until the numbers stood
side by side.

## Install

**From the Chrome Web Store** —
[HTML Text to .md — Local Markdown Web Clipper](https://chromewebstore.google.com/detail/gkplehkbkofmdjhafgbclcmfcficoego),
the reviewed build, updated automatically. Works in Chrome and other
Chromium browsers that use the store (Edge, Brave, Opera, Vivaldi, Arc).

**From source** — [build it](#build), then open `chrome://extensions`, turn on
**Developer mode**, click **Load unpacked** and pick the `dist/` directory. The
extension appears in the toolbar; pin it if you want the icon visible. After a
rebuild, press the reload arrow on its card — Chrome does not pick up changes
on its own.

## What it does

- **Selection capture** — select anything, click the floating button (or press
  <kbd>Alt</kbd>+<kbd>M</kbd>) and get Markdown. Multi-range selections are
  joined into one document; Shadow DOM content is flattened before conversion,
  so web components convert like ordinary markup.
- **Highlighter mode** — click whole blocks (paragraphs, lists, tables, code,
  quotes) to collect them across the page, then capture them all at once.
- **Side panel workspace** — rendered preview and raw source in one toggle,
  undo/redo, copy, download as `.md` or `.txt`, and appending several clippings
  into one note.
- **Front matter** — title, source URL and capture date are added as YAML front
  matter, so clippings drop straight into Obsidian or any vault.
- **Math and code** — MathML is converted to LaTeX and rendered with KaTeX in
  the preview; fenced code blocks keep their language.
- **52 locales**, including full RTL layout for Arabic, Hebrew and Persian.

## Build

Requires [Bun](https://bun.sh) (the transpiler) and Chrome. The build itself
needs no `node_modules` — Bun compiles the TypeScript directly and every runtime
dependency is vendored.

```bash
git clone https://github.com/andryushkin/webtodotmd.git
cd webtodotmd
bash build.sh
```

The unpacked extension lands in `dist/`, ready to load as described in
[Install](#install).

## Tests

Tests are the one place that needs a package install: `linkedom` provides the
DOM the conversion tests run against. The same install also pulls the `core/`
package's own toolchain (`tsup`, ESLint, TypeScript), which the extension build
does not use.

```bash
bun install
bun test
```

That runs both suites: the extension's and the conversion core's in
`core/tests/`.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/content/` | Content script: selection capture, highlighter mode, page title normalization |
| `src/sidepanel/` | The main UI — preview/source, toolbar, rating widget |
| `src/background/` | Service worker: context menu, commands, panel behavior |
| `src/settings/` | Options page |
| `src/shared/` | i18n, icons, storage, injection, telemetry |
| `public/_locales/` | 52 locales; must live under `public/` to reach `dist/` |
| `core/` | The `htmltodotmd` HTML → Markdown library: rules, parser, tests |
| `vendor/` | Vendored runtime deps: marked, DOMPurify, KaTeX, mathml-to-latex |
| `docs/` | Domain documentation ([index](docs/README.md)) |

Before pushing or changing repository visibility, run the static public-repo
gate:

```bash
scripts/audit.sh
```

The criteria and the remaining manual checks are documented in
[docs/audit.md](docs/audit.md).

## Privacy

Captured content stays on the device: conversion happens in the content script,
and the extension has no server to send it to. The only network call is an
anonymous usage counter (a random install ID plus an event name such as `copy`
or `download_md`) sent to `2md.site` — no URLs, no page content, no personal
data. The published policy is
[dotmd.tools/html-to-md-privacy](https://dotmd.tools/html-to-md-privacy): it
names every event the counter can carry, every permission and what it is for,
and the feedback form on the removal page, which is the only other thing that
leaves the device — and only if you type into it.

## Repository notes

This is a personal project developed largely with AI agents. `CLAUDE.md` and
`AGENTS.md` are the agent working guides, and [`docs/`](docs/README.md) holds
the domain documentation, written for humans and agents alike.

## Contributing

Bug reports and ideas help most: bugs go to
[Issues](https://github.com/andryushkin/webtodotmd/issues), ideas and questions
to [Discussions](https://github.com/andryushkin/webtodotmd/discussions).
[CONTRIBUTING.md](CONTRIBUTING.md) has the details, including the deliberately
narrow pull-request policy.

## License

[MIT](LICENSE). Bundled third-party code is listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
