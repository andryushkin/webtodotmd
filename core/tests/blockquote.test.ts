import { describe, it, expect, beforeAll } from 'vitest';
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
