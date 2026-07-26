import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('headings', () => {
  it('h1', () => {
    expect(toMarkdown('<h1>Title</h1>')).toBe('# Title\n');
  });

  it('h2', () => {
    expect(toMarkdown('<h2>Title</h2>')).toBe('## Title\n');
  });

  it('h6', () => {
    expect(toMarkdown('<h6>Title</h6>')).toBe('###### Title\n');
  });

  it('empty heading is skipped', () => {
    expect(toMarkdown('<h3></h3>')).toBe('\n');
  });

  it('multiple headings', () => {
    expect(toMarkdown('<h1>First</h1><h2>Second</h2>')).toBe('# First\n\n## Second\n');
  });

  it('strips anchor with class=heading-link', () => {
    expect(toMarkdown('<h2><a class="heading-link">¶</a> Title</h2>')).toBe('## Title\n');
  });

  it('headingOffset shifts levels', () => {
    expect(toMarkdown('<h2>A</h2><h3>B</h3>', { headingOffset: -1 })).toBe('# A\n\n## B\n');
  });

  it('headingOffset clamps to h1 minimum', () => {
    expect(toMarkdown('<h1>Title</h1>', { headingOffset: -5 })).toBe('# Title\n');
  });

  it('headingOffset clamps to h6 maximum', () => {
    expect(toMarkdown('<h1>Title</h1>', { headingOffset: 10 })).toBe('###### Title\n');
  });
});
