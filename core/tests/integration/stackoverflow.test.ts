import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('Stack Overflow answer fixture', () => {
  const html = readFileSync(
    new URL('../fixtures/stackoverflow-answer.html', import.meta.url),
    'utf8',
  );

  it('produces fenced code blocks', () => {
    const result = toMarkdown(html);
    expect(result).toContain('```');
  });

  it('preserves inline code', () => {
    const result = toMarkdown(html);
    expect(result).toContain('`Array.from()`');
  });

  it('renders heading', () => {
    const result = toMarkdown(html);
    expect(result).toMatch(/^##\s+Why/m);
  });

  it('does not contain raw HTML tags in output', () => {
    const result = toMarkdown(html);
    expect(result).not.toMatch(/<div/);
    expect(result).not.toMatch(/<pre/);
  });
});
