import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('blockquote', () => {
  it('simple blockquote with paragraph', () => {
    expect(toMarkdown('<blockquote><p>Quote</p></blockquote>')).toBe('> Quote\n');
  });

  it('blockquote with two paragraphs', () => {
    expect(toMarkdown('<blockquote><p>P1</p><p>P2</p></blockquote>')).toBe('> P1\n>\n> P2\n');
  });

  it('nested blockquote', () => {
    expect(
      toMarkdown('<blockquote><p>Outer</p><blockquote><p>Inner</p></blockquote></blockquote>'),
    ).toBe('> Outer\n>\n> > Inner\n');
  });

  it('empty blockquote is skipped', () => {
    expect(toMarkdown('<blockquote></blockquote>')).toBe('\n');
  });
});

// Also from the manual pass: the whitespace between a `</p>` and the `<ul>` after
// it is a line of spaces, which the 3+ newline collapse does not see, so the quote
// came out with a run of bare `>` lines through the middle of it.
describe('blockquote with indented markup inside', () => {
  it('does not turn HTML indentation into blank quote lines', () => {
    const html = `<blockquote>
      <p>Quoted line.</p>
      <ul><li>First</li><li>Second</li></ul>
    </blockquote>`;
    expect(toMarkdown(html).trim()).toBe('> Quoted line.\n>\n> - First\n> - Second');
  });
});
