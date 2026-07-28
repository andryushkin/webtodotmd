# Text to .md agent instructions

## Startup

1. Read `CLAUDE.md` in full — the compressed working guide: project map,
   build/test commands, the pairs that must not drift apart, and the authority
   order when sources disagree.
2. Read the sheet in `docs/invariants/` covering the directory you are about to
   change, before you change it. Nothing loads it for you, and every rule in it
   is a defect somebody already shipped.
3. Check `git status --short`. Preserve anything already dirty in the
   worktree; never include someone else's changes in your commits.
4. Open `docs/README.md` and read only the domain doc matching your task
   (architecture, features, localization, releasing).

## Execution

- All prose in the repository is English: comments, docs, commit messages. The
  exception is `public/_locales/`, which is translations by definition, and the
  Russian examples inside `docs/localization.md`.
- Conversion bugs usually belong to the `core/` package — the HTML → Markdown
  library this extension is built on. Fix them there, with tests in
  `core/tests/`, rather than patching around bad Markdown in `src/`.
- Verify with a real build: `bash build.sh`, then `bun test`. Behavior
  that only the browser exercises (panel UI, highlighter, shortcuts) needs the
  unpacked extension reloaded in `chrome://extensions`.
- Before pushing or changing repository visibility, run `scripts/audit.sh`
  and resolve every failure using the criteria in `docs/audit.md`.
- A new UI string means a new key in all 52 locales, not just `en`. The
  completeness check is in `docs/releasing.md`.
- Keep commits narrow and single-purpose; the message style is `feat`, `fix`,
  `refactor`, `docs`, `chore`.
- When you change behavior a domain doc describes, update that doc in the same
  change; a durable new rule about one directory goes in its sheet under
  `docs/invariants/`, with the failure that motivated it beside it.
