# Contributing

Text to .md is a personal project with a single maintainer, developed largely
with AI agents. It is intentionally opinionated: whether a change fits the way
the extension works matters as much as whether the code is good. This page is
short — please read it before opening anything.

## The short version

**Ideas and bug reports help more than code.** Every merged line is something
the maintainer supports from then on, so the most valuable contribution here is
a reproducible bug report or a well-argued idea, not a pull request.

## Where things go

- **Bugs** → [Issues](https://github.com/andryushkin/webtodotmd/issues).
  Describe what you selected, what Markdown you got, and what you expected,
  plus the page URL and your Chrome version. A minimal HTML snippet that
  reproduces the problem is worth more than any amount of description.
- **Ideas and feature requests** →
  [Discussions ▸ Ideas](https://github.com/andryushkin/webtodotmd/discussions/categories/ideas).
  Features start as a conversation about the problem, not as code.
- **Questions** →
  [Discussions ▸ Q&A](https://github.com/andryushkin/webtodotmd/discussions/categories/q-a).

Conversion bugs — wrong Markdown for correct HTML — belong to the conversion
core in `core/`, which lives in this repository and is published separately as
a library. Report them here either way; the fix goes into `core/` with tests in
`core/tests/`.

## Pull requests

- Typo fixes, documentation corrections, and small obvious bug fixes are
  welcome — no need to ask first.
- Anything larger — a feature, a behavior change, a refactor — needs a
  discussion **before** the code. Unsolicited feature PRs will most likely be
  closed even when the code is clean: a decline is a design call, not a review
  of your work.
- For PRs that do get a go-ahead: `bash build.sh` and `bun test src` must pass
  (see the [README](README.md#build)), and the extension must load unpacked
  without console errors.

## Translations

The UI ships in 52 locales under `public/_locales/`. Every locale carries the
same key set, so a new key must be added to all of them at once, not just
English. Corrections to an existing translation are always welcome — they are
the easiest useful PR in this repository.

## Expectations

This is a spare-time project. Everything gets read, but replies take as long as
they take, and only what the maintainer is prepared to keep maintaining gets
merged. "No" is a normal outcome and usually says nothing about the quality of
the proposal.

By contributing you agree that your contribution is licensed under the
project's [MIT license](LICENSE).
