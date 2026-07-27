import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';
import { CODE_INDENT_MARK, normalize } from '../src/core/normalizer.js';
import { extractFlankingWhitespace } from '../src/utils/flanking.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('whitespace phase 1 — DOM collapsing', () => {
  it('collapses multiple spaces', () => {
    expect(toMarkdown('<p>hello   world</p>')).toBe('hello world\n');
  });

  it('collapses newlines inside p into spaces', () => {
    expect(toMarkdown('<p>line1\nline2</p>')).toBe('line1 line2\n');
  });

  it('collapses tabs inside p into spaces', () => {
    expect(toMarkdown('<p>word1\t\tword2</p>')).toBe('word1 word2\n');
  });
});

describe('whitespace phase 3 — output normalization', () => {
  it('collapses 3+ newlines to 2', () => {
    expect(normalize('\n\n\ntext\n\n\n')).toBe('text\n');
  });

  it('removes trailing spaces per line', () => {
    expect(normalize('text   \nmore')).toBe('text\nmore\n');
  });

  it('adds final newline', () => {
    expect(normalize('text')).toBe('text\n');
  });

  it('converts &nbsp; (\\u00A0) to regular space', () => {
    expect(normalize('Цена:\u00A0100')).toBe('Цена: 100\n');
  });

  it('removes leading newlines', () => {
    expect(normalize('\n\ntext')).toBe('text\n');
  });
});

// The other half of the same rule: what the *page* wrote goes on becoming an
// ordinary space wherever it lands, and the marker the converter writes for a
// folded code line does not. Asserted on whole strings rather than trimmed ones,
// because U+00A0 and U+0020 print alike and trim() removes both.
describe("nbsp folding: the page's own non-breaking space", () => {
  it.each([
    ['prose', '<p>Price:&nbsp;100</p>', 'Price: 100\n'],
    ['a heading', '<h2>Q&nbsp;A</h2>', '## Q A\n'],
    [
      'a table cell',
      '<table><tr><th>a&nbsp;b</th></tr><tr><td>c&nbsp;d</td></tr></table>',
      '| a b |\n| --- |\n| c d |\n',
    ],
    // Not in a table, so this is the fenced block rather than the fold: a path
    // that reads the page off textContent and never sees a text node.
    ['a <pre>', '<pre>x&nbsp;y</pre>', '```\nx y\n```\n'],
    ['a code span', '<p><code>x&nbsp;y</code></p>', '`x y`\n'],
  ])('becomes an ordinary space in %s', (_name, html, expected) => {
    const md = toMarkdown(html);
    expect(md).toBe(expected);
    expect(md).not.toContain('\u00A0');
  });
});

describe('nbsp folding: the marker the converter writes', () => {
  it('becomes a non-breaking space, and the fold runs first', () => {
    // Order is the whole of it. Expanded before the fold, the marker would be
    // folded away with the page's own; expanded after, the two are already
    // apart and each gets its own answer.
    expect(normalize('a\u00A0b' + CODE_INDENT_MARK + 'c')).toBe('a b\u00A0c\n');
  });

  it('leaves no marker behind', () => {
    expect(normalize('x' + CODE_INDENT_MARK + 'y')).not.toContain(CODE_INDENT_MARK);
  });
});

describe('whitespace phase 2 — flanking utility', () => {
  it('extracts leading and trailing whitespace', () => {
    expect(extractFlankingWhitespace(' hello ')).toEqual({
      leading: ' ',
      trimmed: 'hello',
      trailing: ' ',
    });
  });

  it('returns empty strings when no whitespace', () => {
    expect(extractFlankingWhitespace('text')).toEqual({
      leading: '',
      trimmed: 'text',
      trailing: '',
    });
  });

  it('handles only whitespace', () => {
    const result = extractFlankingWhitespace('   ');
    expect(result.trimmed).toBe('');
  });

  it('handles empty string', () => {
    expect(extractFlankingWhitespace('')).toEqual({
      leading: '',
      trimmed: '',
      trailing: '',
    });
  });
});
