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

  // Upwards only: an `<h1>` is the rank the page gave its title, and pushing it
  // to `##` to keep `#` free spends the reader's structure on the note's own.
  it('leaves a document that already starts at h1 alone', () => {
    expect(toMarkdown('<h1>A</h1><h2>B</h2>', { topHeadingLevel: 2 })).toBe('# A\n\n## B\n');
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

// An interface built out of divs writes its headings with ARIA, and a reader
// meets a heading whatever the tag said. Google's AI answers put every section
// title this way, and the file came back with all of them as paragraphs.
describe('role="heading"', () => {
  it('becomes a heading at the level it states', () => {
    expect(toMarkdown('<div role="heading" aria-level="3">Title</div>')).toBe('### Title\n');
  });

  it('a level it does not state reads as 2, which is what a browser reports', () => {
    expect(toMarkdown('<div role="heading">Title</div>')).toBe('## Title\n');
  });

  it('a level Markdown cannot write falls back to the same default', () => {
    expect(toMarkdown('<div role="heading" aria-level="9">Title</div>')).toBe('## Title\n');
    expect(toMarkdown('<div role="heading" aria-level="x">Title</div>')).toBe('## Title\n');
  });

  it('counts for the normalisation, like a heading tag does', () => {
    const html = '<div role="heading" aria-level="3">A</div><div role="heading" aria-level="4">B</div>';
    expect(toMarkdown(html, { topHeadingLevel: 2 })).toBe('## A\n\n### B\n');
  });

  it('empty is skipped, like a heading tag is', () => {
    expect(toMarkdown('<div role="heading" aria-level="3"></div>')).toBe('\n');
  });
});
