# Contributing to @markitdown/core

## Reporting a bug

Before opening an issue:

1. Check [existing issues](https://github.com/your-org/markitdown/issues) — it may already be reported
2. Confirm you are on the latest version (`npm info @markitdown/core version`)
3. Reproduce with the minimal HTML snippet (not an entire page)

**Issue template:**

```
**Version:** 0.1.0
**Runtime:** Chrome 124 / Node.js 22 / Bun 1.x

**HTML input:**
<paste minimal reproducing snippet>

**Expected output:**
<what Markdown you expected>

**Actual output:**
<what the library produced>
```

Open an issue at: https://github.com/your-org/markitdown/issues

## Asking a question / suggesting a feature

Use [GitHub Discussions](https://github.com/your-org/markitdown/discussions) for questions. For feature requests, open an issue with the `enhancement` label.

## Development

### Setup

```bash
git clone https://github.com/your-org/markitdown.git
cd markitdown
bun install
```

### Commands

```bash
bun test                        # run all tests
bun test tests/tables.test.ts   # run a single file
bun run build                   # build dist/
bun run lint                    # ESLint
bun run lint:fix                # ESLint auto-fix
bun run tsc                     # type check
bun run format                  # Prettier format
bun run format:check            # check formatting
```

### Adding a test

Tests live in `tests/` as pairs of HTML input → expected Markdown output.

```typescript
// tests/my-feature.test.ts
import { describe, it, expect } from 'vitest';
import { toMarkdown } from '../src/browser.js';

describe('my feature', () => {
  it('converts X to Y', () => {
    expect(toMarkdown('<X>content</X>')).toBe('expected output');
  });
});
```

Run `bun test tests/my-feature.test.ts` to verify before committing.

### Pre-commit checklist

```bash
bun test && bun run lint && bun run tsc && bun run format:check
```

All four must pass.

## Pull Request requirements

- Include at least one test covering the change
- All pre-commit checks pass
- Keep the PR focused — one change per PR
- Update `docs/LIBRARY_SPEC.md` if you change conversion behavior

Thank you for contributing!
