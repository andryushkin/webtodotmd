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
    // One space in the middle, not two. Both `<div>`s declare themselves inline,
    // so the blank between them stands between two inline runs and is the one
    // thing keeping two words apart; the second run brings a space of its own,
    // and a browser folds the pair into one. This assertion used to pin both of
    // them, which is the defect written down — `foldedIntoSeam()` is what takes
    // the second, and the first is exactly what stops `div,second` welding.
    expect(toMarkdown(html)).toBe('Before…\n\nFirst inline div, second inline div.\n');
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

// Two collapsible runs that meet across an element boundary are one space on
// screen, and used to arrive as two: the newline and the indentation between the
// tags collapse to one, the run the next element opens with is another, and both
// survived. Nothing renders differently for it, which is how it went unseen —
// two spaces render as one — but the Source pane is the half of the product a
// person edits by hand, and it was wrong there.
describe('whitespace seam: two runs that meet arrive as one space', () => {
  const inlineDiv = (content: string): string => `<div style="display:inline">${content}</div>`;

  it.each([
    // Case S3 of the conversion spec page, which is where this was reported.
    [
      'indentation between the elements and a space inside the second',
      `<body>${inlineDiv('First inline div,')}\n${inlineDiv(' second inline div.')}</body>`,
      'First inline div, second inline div.\n',
    ],
    [
      'indentation on both sides of the boundary',
      `<body>${inlineDiv('First,\n')}\n${inlineDiv('second.')}</body>`,
      'First, second.\n',
    ],
    [
      'a space between the elements and a leading one inside the second',
      `<body>${inlineDiv('First,')} ${inlineDiv(' second.')}</body>`,
      'First, second.\n',
    ],
    [
      'a trailing space in the first element meeting a leading one in the second',
      '<p><span>a </span><span> b</span></p>',
      'a b\n',
    ],
    // The blank between the elements has one on either side of it, so the fold
    // happens twice and three runs still leave one space.
    ['three runs at the same seam', '<p><span>a </span> <span> b</span></p>', 'a b\n'],
    // The blank is a sibling of the wrapper rather than of the text, so the walk
    // has to leave every container that does not bound the line to find it.
    [
      'a leading space inside a nested wrapper',
      `<body>${inlineDiv('First,')}\n${inlineDiv('<span> second.</span>')}</body>`,
      'First, second.\n',
    ],
  ])('folds %s', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });
});

describe('whitespace seam: what the fold must not take', () => {
  it.each([
    // Neither side offers a blank, so there is none to fold — and none to
    // invent. The page drew one word and the file holds one.
    ['neither side offers whitespace', '<p><span>a</span><span>b</span></p>', 'ab\n'],
    // The expensive direction, in every shape the boundary comes in. One space
    // is the only thing keeping two words apart, and it counts the same
    // whichever side of the boundary the page wrote it on.
    ['a lone space inside the second element', '<p><span>a</span><span> b</span></p>', 'a b\n'],
    [
      'a lone space before an image',
      '<p>word <img alt="pic" src="p.png"></p>',
      'word ![pic](p.png)\n',
    ],
    [
      'a lone space after an image',
      '<p><img alt="pic" src="p.png"> word</p>',
      '![pic](p.png) word\n',
    ],
    ['a lone space before a code span', '<p>word <code>x</code></p>', 'word `x`\n'],
    ['a lone space after a code span', '<p><code>x</code> word</p>', '`x` word\n'],
  ])('keeps %s', (_name, html, expected) => {
    expect(toMarkdown(html)).toBe(expected);
  });

  it('a non-breaking space beside an ordinary one, both characters', () => {
    // Not collapsible: the page chose the character and a browser draws one
    // wherever it stands, so the pair is two blanks on screen and two in the
    // file. `normalize()` is what turns the first into an ordinary space, at the
    // very end and never by folding it into its neighbour.
    const md = toMarkdown('<p><span>a&nbsp;</span><span> b</span></p>');
    expect(md).toBe('a  b\n');
    expect(md).not.toContain('\u00A0');
  });

  it("a pipe table's column padding", () => {
    // `buildGFMTable` pads its cells with runs of spaces to line the columns up.
    // Those are the converter's characters rather than the page's, and the fold
    // never meets them: it is asked of a text node, long before a rule assembles
    // a grid out of what the cells converted to.
    expect(
      toMarkdown('<table><tr><th>name</th><th>n</th></tr><tr><td>a</td><td>1234</td></tr></table>'),
    ).toBe('| name | n    |\n| ---- | ---- |\n| a    | 1234 |\n');
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

// The seam had only the tag to go on, so an element that writes nothing still
// reported ink and neither neighbour folded its blank. Same invariant as the
// escaper's, one boundary over: a line starts where nothing has been *written*.
describe('seam across an element that writes nothing', () => {
  it('a spacer image between two words leaves one space', () => {
    expect(
      toMarkdown('<p>Cited by <img alt="" src="s.gif" width="1" height="1"> Smashing Magazine</p>'),
    ).toBe('Cited by Smashing Magazine\n');
  });

  it('an empty wrapper between two words leaves one space', () => {
    expect(toMarkdown('<p>Empty: <q></q> and a mark</p>')).toBe('Empty: and a mark\n');
  });

  // Never the other way: an element that does write still parts its neighbours,
  // or the fold would weld two words into one.
  it('a picture that is written still parts them', () => {
    expect(toMarkdown('<p>before <img alt="A photo" src="p.jpg"> after</p>')).toBe(
      'before ![A photo](p.jpg) after\n',
    );
  });

  it('one real space between two runs is still one', () => {
    expect(toMarkdown('<p><span>Two runs</span> <span>with one space</span></p>')).toBe(
      'Two runs with one space\n',
    );
  });

  it('runs the page welded stay welded', () => {
    expect(toMarkdown('<p><span>Neither side offers one</span><span>and they weld.</span></p>')).toBe(
      'Neither side offers oneand they weld.\n',
    );
  });
});
