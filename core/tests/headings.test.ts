import { describe, it, expect, beforeAll } from 'bun:test';
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

// A capture is a piece of a page and its headings start wherever the page's do:
// a chat interface writes a whole answer under `<h3>`, and a fixed shift made a
// file whose first heading was `####` with nothing above it anywhere.
describe('topHeadingLevel', () => {
  it('puts the shallowest heading at the level asked for', () => {
    expect(toMarkdown('<h3>A</h3><h4>B</h4>', { topHeadingLevel: 2 })).toBe('## A\n\n### B\n');
  });

  it('keeps the distance between levels rather than the levels', () => {
    expect(toMarkdown('<h1>A</h1><h2>B</h2>', { topHeadingLevel: 2 })).toBe('## A\n\n### B\n');
  });

  it('lifts a lone deep heading', () => {
    expect(toMarkdown('<h6>Deep</h6>', { topHeadingLevel: 2 })).toBe('## Deep\n');
  });

  it('a document with no heading is unaffected', () => {
    expect(toMarkdown('<p>text</p>', { topHeadingLevel: 2 })).toBe('text\n');
  });

  it('a heading nobody saw does not set the base', () => {
    const html = '<h1 style="display:none">hidden</h1><h3>Shown</h3>';
    expect(toMarkdown(html, { topHeadingLevel: 2 })).toBe('## Shown\n');
  });

  it('an explicit offset wins — the caller stating the answer, not asking', () => {
    expect(toMarkdown('<h3>A</h3>', { topHeadingLevel: 2, headingOffset: 0 })).toBe('### A\n');
  });
});
