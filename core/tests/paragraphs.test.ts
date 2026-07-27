import { describe, it, expect, beforeAll } from 'bun:test';
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
// A `<br>` with nothing left to break: one a block ends on, or one a page puts
// between two blocks to draw vertical space without a paragraph. Hacker News
// does both, and a captured discussion page carried 133 lines holding a lone
// backslash.
describe('перенос, которому нечего переносить', () => {
  it('в конце блока не пишется', () => {
    expect(toMarkdown('<p>text<br></p><p>next</p>')).toBe('text\n\nnext\n');
  });

  it('между блоками не пишется', () => {
    expect(toMarkdown('<div>a</div><br><div>b</div>')).toBe('a\n\nb\n');
  });

  it('внутри абзаца остаётся', () => {
    expect(toMarkdown('<p>a<br>b</p>')).toBe('a\\\nb\n');
  });

  it('два подряд внутри абзаца остаются оба', () => {
    expect(toMarkdown('<p>a<br><br>b</p>')).toBe('a\\\n\\\nb\n');
  });
});
