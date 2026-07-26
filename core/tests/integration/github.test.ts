import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('GitHub code block fixture', () => {
  const html = readFileSync(new URL('../fixtures/github-code-block.html', import.meta.url), 'utf8');

  it('produces fenced code block', () => {
    const result = toMarkdown(html);
    expect(result).toContain('```');
  });

  it('preserves code content (interface keyword)', () => {
    const result = toMarkdown(html);
    expect(result).toContain('interface');
    expect(result).toContain('fetchUser');
  });

  it('does not contain raw span tags', () => {
    const result = toMarkdown(html);
    expect(result).not.toMatch(/<span/);
  });

  it('does not contain raw div tags', () => {
    const result = toMarkdown(html);
    expect(result).not.toMatch(/^\s*<div/m);
  });
});
