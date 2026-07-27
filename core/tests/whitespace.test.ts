import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
// The parser that draws the side panel's preview, reached the same way and for
// the same reason as in `lists.test.ts`, which explains the excuse: only it can
// say whether the reader was given a paragraph or a code listing.
// @ts-expect-error untyped vendor module
import { marked } from '../../vendor/marked.esm.js';
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

const parser = marked as { parse(md: string, opts: object): string };
const render = (md: string): string => parser.parse(md, { gfm: true, breaks: true });

// The newline and the indentation between a `</p>` and the tag after it are the
// source file's layout, not the page's: a browser draws none of it. `sanitize()`
// collapses every such run to a single space, correctly — it cannot yet tell
// that seam from the one between two words — and the space then reached the file
// at the start of a line, which is where a space stops being invisible.
describe('whitespace between blocks: a blank at a line edge draws nothing', () => {
  it('a blank after a closed block is not a space before the next run', () => {
    const html =
      '<body><p>Before…</p>\n' +
      '<div style="display:inline">First inline div,</div>\n' +
      '<div style="display:inline"> second inline div.</div></body>';
    // The pair of spaces in the middle stays, and stays on purpose. Both `<div>`s
    // declare themselves inline, so that blank stands between two inline runs and
    // is the one thing keeping two words apart; the second run happens to bring a
    // space of its own, and a browser folds the two into one. Folding them here
    // would mean knowing what the neighbours render rather than where the line
    // ends — and two spaces mid-line render as one, while taking the wrong one of
    // them welds `div,second` together.
    expect(toMarkdown(html)).toBe('Before…\n\nFirst inline div,  second inline div.\n');
  });

  it('a run of comments between blocks does not indent the prose after them', () => {
    // Each comment is dropped and the whitespace around it is not, so four blanks
    // survive as four spaces at the start of a line — an indented code block.
    // Comments between blocks are how ad slots, template engines and CMS output
    // are written, so this is not an exotic shape.
    const html =
      '<body><p>x</p>\n<!--a-->\n<!--b-->\n<!--c-->\n' +
      '<div style="display:inline">indented?</div></body>';
    const md = toMarkdown(html);
    expect(md).toBe('x\n\nindented?\n');

    // What the reader actually gets. Before the fix `marked` drew the second
    // paragraph as `<pre><code>indented?</code></pre>`.
    const out = render(md);
    expect(out).toContain('<p>indented?</p>');
    expect(out).not.toContain('<pre>');
  });

  it('a blank at the start of a container is not a space before its content', () => {
    // Nothing precedes it on the line, because the container itself has only just
    // opened. `<section>` and `<body>` are both outside `BLOCK_PARENTS`, so
    // `opensBlock()` answers `false` here — this is exactly where the defect was.
    expect(toMarkdown('<section>\n  <span>Inside</span>\n</section>')).toBe('Inside\n');
    expect(toMarkdown('<body> <span>x</span></body>')).toBe('x\n');
  });

  it('a blank before a block is not a space at the end of the line before it', () => {
    // The other edge, and the one this rule does not have to itself: a block
    // follows, so nothing can join the line and the blank separates nothing —
    // but `normalize()` strips trailing spaces per line and every block rule
    // trims its content, so the character had four ways to die already. Stated
    // here because the rule is symmetric and those four are not the rule.
    expect(toMarkdown('<body><span>x</span> <p>y</p></body>')).toBe('x\n\ny\n');
  });
});

describe('whitespace between blocks: a blank between two runs is a space', () => {
  it.each([
    // One space the reader saw, and the only thing keeping two words apart.
    ['two inline elements', '<p><span>a</span> <span>b</span></p>', 'a b\n'],
    ['a word and an emphasised run', '<p>word <em>emph</em></p>', 'word _emph_\n'],
    // Two blocks that declined the block their tag implies: one sentence.
    [
      'two blocks declaring themselves inline',
      '<div><p style="display:inline">Yes</p> <p style="display:inline">No</p></div>',
      'Yes No\n',
    ],
    // Not collapsible at all — a browser draws a non-breaking space wherever it
    // stands, and `trim()` would have taken this node for a blank.
    [
      'a non-breaking space between two blocks',
      '<body><p>x</p>&nbsp;<div style="display:inline">y</div></body>',
      'x\n\n y\n',
    ],
  ])('survives between %s', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  it('indentation inside a <pre> is the sample, not layout', () => {
    expect(toMarkdown('<pre><code>def f():\n    return 1</code></pre>')).toBe(
      '```\ndef f():\n    return 1\n```\n',
    );
  });

  it('a cell whose whole text is one space still leaves the column its width', () => {
    expect(
      toMarkdown('<table><tr><th>a</th><th>b</th></tr><tr><td> </td><td>c</td></tr></table>'),
    ).toBe('| a   | b   |\n| --- | --- |\n|     | c   |\n');
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
