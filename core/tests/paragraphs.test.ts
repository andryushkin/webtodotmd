import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('paragraphs', () => {
  it('single paragraph', () => {
    expect(toMarkdown('<p>Text</p>')).toBe('Text\n');
  });

  it('two paragraphs separated by blank line', () => {
    expect(toMarkdown('<p>First</p><p>Second</p>')).toBe('First\n\nSecond\n');
  });

  it('empty paragraph is skipped', () => {
    expect(toMarkdown('<p></p><p>Text</p>')).toBe('Text\n');
  });

  it('br inside paragraph produces backslash line break', () => {
    expect(toMarkdown('<p>Line 1<br/>Line 2</p>')).toBe('Line 1\\\nLine 2\n');
  });
});

describe('hr', () => {
  it('horizontal rule', () => {
    expect(toMarkdown('<hr/>')).toBe('---\n');
  });
});

describe('div', () => {
  it('two divs separated by blank line', () => {
    expect(toMarkdown('<div>Text1</div><div>Text2</div>')).toBe('Text1\n\nText2\n');
  });

  it('empty div is skipped', () => {
    expect(toMarkdown('<div></div><div>Content</div>')).toBe('Content\n');
  });
});
