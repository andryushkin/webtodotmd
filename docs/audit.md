# Public repository audit

Run this audit before pushing and immediately before changing the repository
from private to public. It is read-only and fail-closed: a check that cannot run
is a failure, not a silent pass.

## Mechanical gate

```bash
scripts/audit.sh
```

The script checks:

1. Relative links in the public Markdown documentation.
2. Secret-shaped values in the current tree and every exposed Git ref.
3. Internal machine paths and removed agent-only material in public history.
4. Manifest/package version agreement and locale key parity.
5. The conversion core: `core/src/browser.ts`, its license and package
   manifest, and the content script's import of it.
6. Local license texts for every vendored dependency and their inclusion in
   the packaged extension.
7. Guide size budgets: `CLAUDE.md` at most 195 lines, `AGENTS.md` at most 45, and each
   path-scoped `CLAUDE.md` (`core/`, `src/*/`) at most 120 — so a section cannot meet
   the root budget by moving house.
8. Tracked junk and whitespace errors in the worktree, index, and outgoing
   range. The base resolves from `AUDIT_BASE`, the branch upstream, or
   `origin/<branch>`; failure to resolve a base is an audit failure.

Build and tests are separate, heavier gates:

```bash
bash build.sh
bun test
```

For a release, also load `dist/` unpacked in Chrome and exercise capture, the
side panel, settings, keyboard shortcuts, and highlighter mode.

## Reviewer judgment

The script cannot decide these:

1. Does the README accurately describe the current product and telemetry?
2. Are privacy-policy claims consistent with the actual request payload and
   storage behavior?
3. Are screenshots and editable design sources intentional public assets?
4. Does every outgoing ref contain only material the maintainer intends to
   publish, including deleted files that remain in history?
5. Does `core/` still carry its own LICENSE and README, so the library stays
   publishable on its own?
6. Are GitHub Issues and Discussions enabled with the `ideas` and `q-a`
   categories, and are security settings reviewed after visibility changes?
7. Did a fresh clone build without local paths or untracked files?

Every item must be PASS or explicitly WAIVED by the maintainer before the
visibility change. The audit never changes visibility, pushes, rewrites
history, or creates GitHub issues.
