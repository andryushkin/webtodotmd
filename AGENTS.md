# Text to .md agent instructions

## Startup

1. Read `CLAUDE.md` in full — the compressed working guide: project map,
   build/test commands, non-negotiable invariants.
2. Check `git status --short`. Preserve anything already dirty in the
   worktree; never include someone else's changes in your commits.
3. Open `docs/README.md` and read only the domain doc matching your task
   (architecture, features, localization, releasing).

## Authority order

When sources disagree: the user's request → current code and tests →
`CLAUDE.md` → domain docs. A doc that contradicts the code is a bug in the
doc — fix it in the same change.

## Execution

- All prose in the repository is English: comments, docs, commit messages. The
  exception is `public/_locales/` and `docs/lang/`, which are translations by
  definition, and the Russian examples inside `docs/localization.md`.
- Conversion bugs usually belong to
  [htmltodotmd](https://github.com/andryushkin/htmltodotmd), the
  `vendor/htmltodotmd` submodule — check there before patching around a bad
  conversion here. Do not commit submodule pointer bumps as a side effect of
  unrelated work.
- Verify with a real build: `bash build.sh`, then `bun test src`. Behavior
  that only the browser exercises (panel UI, highlighter, shortcuts) needs the
  unpacked extension reloaded in `chrome://extensions`.
- A new UI string means a new key in all 52 locales, not just `en`. The
  completeness check is in `docs/releasing.md`.
- Keep commits narrow and single-purpose; the message style is `feat`, `fix`,
  `refactor`, `docs`, `chore`.
- When you change behavior a domain doc describes, update that doc in the same
  change; add durable new rules briefly to `CLAUDE.md`.
