import { readFileSync } from 'fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('arXiv abstract fixture', () => {
  const html = readFileSync(new URL('../fixtures/arxiv-abstract.html', import.meta.url), 'utf8');

  it('renders heading', () => {
    const result = toMarkdown(html);
    expect(result).toMatch(/^##\s+Abstract/m);
  });

  it('renders bold text', () => {
    const result = toMarkdown(html);
    expect(result).toContain('**TransFormer++**');
  });

  it('renders bullet list', () => {
    const result = toMarkdown(html);
    expect(result).toMatch(/^-\s+/m);
    expect(result).toContain('hierarchical attention');
  });

  it('renders link', () => {
    const result = toMarkdown(html);
    expect(result).toContain('[github.com/example/transforemer-plus]');
  });

  it('does not contain raw HTML tags', () => {
    const result = toMarkdown(html);
    expect(result).not.toMatch(/<div/);
    expect(result).not.toMatch(/<ul/);
    expect(result).not.toMatch(/<li/);
  });
});
