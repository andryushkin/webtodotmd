import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('Wikipedia table fixture', () => {
  const html = readFileSync(new URL('../fixtures/wikipedia-table.html', import.meta.url), 'utf8');

  it('renders heading', () => {
    const result = toMarkdown(html);
    expect(result).toMatch(/^##\s+Comparison/m);
  });

  it('renders table as GFM pipe table', () => {
    const result = toMarkdown(html);
    expect(result).toContain('|');
    expect(result).toContain('Language');
    expect(result).toContain('Python');
    expect(result).toContain('TypeScript');
  });

  it('contains table separator row', () => {
    const result = toMarkdown(html);
    expect(result).toMatch(/\|[-\s|]+\|/);
  });

  it('does not contain raw table tags', () => {
    const result = toMarkdown(html);
    expect(result).not.toMatch(/<table/);
    expect(result).not.toMatch(/<tr/);
    expect(result).not.toMatch(/<td/);
  });
});
