import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
// The extension vendors marked as plain JS with no declarations, and this
// package's tsconfig covers `tests/`, so the specifier is excused by hand and
// narrowed to `render` below. Reaching out of `core/` is deliberate: this is the
// parser that draws the side panel's preview, and only it can say whether the
// reader got a list or a line of text.
// @ts-expect-error untyped vendor module
import { marked } from '../../vendor/marked.esm.js';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('unordered list', () => {
  it('базовый <ul><li>', () => {
    expect(toMarkdown('<ul><li>Alpha</li><li>Beta</li></ul>')).toBe('- Alpha\n- Beta\n');
  });

  it('один элемент', () => {
    expect(toMarkdown('<ul><li>Only</li></ul>')).toBe('- Only\n');
  });

  it('три элемента', () => {
    expect(toMarkdown('<ul><li>A</li><li>B</li><li>C</li></ul>')).toBe('- A\n- B\n- C\n');
  });
});

describe('ordered list', () => {
  it('базовый <ol><li>', () => {
    expect(toMarkdown('<ol><li>First</li><li>Second</li></ol>')).toBe('1. First\n2. Second\n');
  });

  it('один элемент', () => {
    expect(toMarkdown('<ol><li>Only</li></ol>')).toBe('1. Only\n');
  });
});

describe('ol start', () => {
  it('<ol start="5"> — нумерация с 5', () => {
    expect(toMarkdown('<ol start="5"><li>Fifth</li><li>Sixth</li></ol>')).toBe(
      '5. Fifth\n6. Sixth\n',
    );
  });

  it('<ol start="0">', () => {
    expect(toMarkdown('<ol start="0"><li>Zero</li><li>One</li></ol>')).toBe('0. Zero\n1. One\n');
  });
});

// A `start` that is not a number used to reach the prefix as `NaN`, and the
// reader got a list numbered `NaN.`, `NaN.`, `NaN.` — every item, not one.
// The browser ignores such an attribute and numbers from 1; so does the file.
describe('ol start: unreadable attribute numbers from 1', () => {
  it('start="x" — not a number at all', () => {
    expect(toMarkdown('<ol start="x"><li>A</li><li>B</li></ol>')).toBe('1. A\n2. B\n');
  });

  it('start="" — empty', () => {
    expect(toMarkdown('<ol start=""><li>A</li><li>B</li></ol>')).toBe('1. A\n2. B\n');
  });

  it('start="  " — whitespace only', () => {
    expect(toMarkdown('<ol start="  "><li>A</li></ol>')).toBe('1. A\n');
  });
});

// Numbers a page may legally write that are not 1 keep their meaning: the guard
// covers the unreadable attribute only, and a zero is falsy but perfectly valid.
describe('ol start: legal numbers survive the guard', () => {
  it('start="0" counts from zero', () => {
    expect(toMarkdown('<ol start="0"><li>A</li><li>B</li></ol>')).toBe('0. A\n1. B\n');
  });

  // The numbers survive; the list does not, because Markdown has no marker for
  // them — a CommonMark ordered marker is digits, so `-2.` was never going to be
  // one. Written as items they were a single paragraph with both lines joined,
  // and the page drew two. A block each is the closest the file comes.
  it('start="-2" keeps both numbers and both lines', () => {
    expect(toMarkdown('<ol start="-2"><li>A</li><li>B</li></ol>')).toBe('-2. A\n\n-1. B\n');
  });

  it('trailing junk is read up to it, as a browser reads it', () => {
    expect(toMarkdown('<ol start="3x"><li>A</li><li>B</li></ol>')).toBe('3. A\n4. B\n');
  });

  it('no attribute at all still counts from 1', () => {
    expect(toMarkdown('<ol><li>A</li><li>B</li></ol>')).toBe('1. A\n2. B\n');
  });
});

describe('nested lists', () => {
  it('ul > li > ul > li (2 уровня)', () => {
    const html = '<ul><li>Level 1<ul><li>Level 2</li></ul></li></ul>';
    expect(toMarkdown(html)).toBe('- Level 1\n  - Level 2\n');
  });

  it('3 уровня вложенности', () => {
    const html = '<ul><li>L1<ul><li>L2<ul><li>L3</li></ul></li></ul></li></ul>';
    expect(toMarkdown(html)).toBe('- L1\n  - L2\n    - L3\n');
  });

  it('ol > li > ul > li', () => {
    const html = '<ol><li>First<ul><li>Sub</li></ul></li></ol>';
    expect(toMarkdown(html)).toBe('1. First\n   - Sub\n');
  });

  it('ul > li > ol > li', () => {
    const html = '<ul><li>Item<ol><li>One</li><li>Two</li></ol></li></ul>';
    expect(toMarkdown(html)).toBe('- Item\n  1. One\n  2. Two\n');
  });
});

describe('loose list', () => {
  it('<li><p>...</p></li>', () => {
    const html = '<ul><li><p>Paragraph one</p><p>Paragraph two</p></li></ul>';
    expect(toMarkdown(html)).toBe('- Paragraph one\n\n  Paragraph two\n');
  });

  it('два loose элемента', () => {
    const html = '<ul><li><p>First</p></li><li><p>Second</p></li></ul>';
    expect(toMarkdown(html)).toBe('- First\n- Second\n');
  });
});

describe('task list', () => {
  it('checked checkbox → [x]', () => {
    const html = '<ul><li><input type="checkbox" checked> Done</li></ul>';
    expect(toMarkdown(html)).toBe('- [x] Done\n');
  });

  it('unchecked checkbox → [ ]', () => {
    const html = '<ul><li><input type="checkbox"> Todo</li></ul>';
    expect(toMarkdown(html)).toBe('- [ ] Todo\n');
  });

  it('смешанный task list', () => {
    const html =
      '<ul><li><input type="checkbox" checked> Done</li><li><input type="checkbox"> Todo</li></ul>';
    expect(toMarkdown(html)).toBe('- [x] Done\n- [ ] Todo\n');
  });
});

// A task marker is not a list marker. The item's content column is after `- ` or
// `8. `; `[x] ` is the first thing *in* that content. Indenting the continuation
// lines by the whole prefix put them four columns past the content column — the
// indented-code threshold — and the same list without a checkbox nested fine.
// So these assert on what `marked` makes of the file as well as on the file:
// the emitted text alone cannot tell a nested list from a line that starts with
// a hyphen, and `marked` is what draws the side panel's preview.
const parser = marked as { parse(md: string, opts: object): string };
const render = (md: string): string => parser.parse(md, { gfm: true, breaks: true });

describe('task item nesting: a nested list stays a list', () => {
  it('a nested <ul> under a checked item sits at the content column', () => {
    const html =
      '<ol start="8"><li><input type="checkbox" checked>Eighth:<ul><li>shipped</li><li>document</li></ul></li></ol>';
    const md = toMarkdown(html);
    expect(md).toBe('8. [x] Eighth:\n   - shipped\n   - document\n');

    // Before the fix the sub-items reached the reader as one line of literal
    // text: `Eighth:<br>- shipped<br>- document`.
    const out = render(md);
    expect(out).toContain('<li>shipped</li>');
    expect(out).toContain('<li>document</li>');
    expect(out).not.toContain('- shipped');
  });

  it('a nested <ol> under a checked item keeps its numbers', () => {
    const html =
      '<ul><li><input type="checkbox" checked>Task:<ol><li>one</li><li>two</li></ol></li></ul>';
    const md = toMarkdown(html);
    expect(md).toBe('- [x] Task:\n  1. one\n  2. two\n');

    const out = render(md);
    expect(out).toContain('<ol>');
    expect(out).toContain('<li>one</li>');
    expect(out).not.toContain('1. one');
  });

  it('an unchecked item indents the same — `[ ] ` is the same width', () => {
    const html = '<ul><li><input type="checkbox">Task<ul><li>sub</li></ul></li></ul>';
    const md = toMarkdown(html);
    expect(md).toBe('- [ ] Task\n  - sub\n');
    expect(render(md)).toContain('<li>sub</li>');
  });

  // The indent follows the marker, so a wider one still lines up — and only the
  // marker widens. `10. [x] ` used to indent by 8 where 4 was the column.
  it('a two-digit marker indents by four, checkbox or not', () => {
    const plain = toMarkdown('<ol start="10"><li>Tenth<ul><li>sub</li></ul></li></ol>');
    const task = toMarkdown(
      '<ol start="10"><li><input type="checkbox" checked>Tenth<ul><li>sub</li></ul></li></ol>',
    );
    expect(plain).toBe('10. Tenth\n    - sub\n');
    expect(task).toBe('10. [x] Tenth\n    - sub\n');
    expect(render(task)).toContain('<li>sub</li>');
  });

  it('a task item inside a task item nests both levels', () => {
    const html =
      '<ul><li><input type="checkbox" checked>Outer<ul><li><input type="checkbox">Inner<ul><li>Deepest</li></ul></li></ul></li></ul>';
    const md = toMarkdown(html);
    expect(md).toBe('- [x] Outer\n  - [ ] Inner\n    - Deepest\n');
    expect(render(md)).toContain('<li>Deepest</li>');
  });
});

describe('task item nesting: a second block stays a block', () => {
  it('a second paragraph is a paragraph, not an indented code block', () => {
    const html = '<ul><li><input type="checkbox" checked><p>First</p><p>Second</p></li></ul>';
    const md = toMarkdown(html);
    expect(md).toBe('- [x] First\n\n  Second\n');

    // Six spaces made `Second` an indented code block — the reader got the
    // sentence in a monospace box.
    const out = render(md);
    expect(out).toContain('<p>Second</p>');
    expect(out).not.toContain('<pre>');
  });

  it('a fenced block keeps its fence instead of being swallowed by one', () => {
    const html = '<ul><li><input type="checkbox" checked>Ex:<pre><code>a\nb</code></pre></li></ul>';
    const md = toMarkdown(html);
    expect(md).toBe('- [x] Ex:\n\n  ```\n  a\n  b\n  ```\n');

    // The over-indent turned the fence itself into code: the reader saw the
    // three backticks as two lines of the listing.
    const out = render(md);
    expect(out).toContain('<code>a\nb\n</code>');
    expect(out).not.toContain('```');
  });
});

describe('code inside list', () => {
  it('<li> с inline <code>', () => {
    expect(toMarkdown('<ul><li>Use <code>foo()</code> here</li></ul>')).toBe(
      '- Use `foo()` here\n',
    );
  });

  it('<li> с <pre><code>', () => {
    const html = '<ul><li>Example:<pre><code>const x = 1;</code></pre></li></ul>';
    const result = toMarkdown(html);
    expect(result).toContain('- Example:');
    expect(result).toContain('const x = 1;');
  });
});

describe('empty items', () => {
  it('<li></li> — пропускать', () => {
    expect(toMarkdown('<ul><li></li></ul>')).toBe('\n');
  });

  it('пустой <li> среди непустых — пропускается', () => {
    expect(toMarkdown('<ul><li>A</li><li></li><li>C</li></ul>')).toBe('- A\n- C\n');
  });
});

// В Markdown нет списка определений, и до этого правила все три тега проваливались
// в default, который возвращает текст детей как есть: `<dt>aa</dt><dd>bb</dd>`
// доходил как `aabb` — страница показывала две строки, читатель получал одно слово.
describe('списки определений', () => {
  it('термин и определение — два блока', () => {
    expect(toMarkdown('<dl><dt>aa</dt><dd>bb</dd></dl>')).toBe('aa\n\nbb\n');
  });

  it('несколько пар не слипаются', () => {
    expect(toMarkdown('<dl><dt>aa</dt><dd>bb</dd><dt>cc</dt><dd>dd</dd></dl>')).toBe(
      'aa\n\nbb\n\ncc\n\ndd\n',
    );
  });

  it('два определения у одного термина', () => {
    expect(toMarkdown('<dl><dt>aa</dt><dd>b1</dd><dd>b2</dd></dl>')).toBe('aa\n\nb1\n\nb2\n');
  });

  it('inline-разметка внутри сохраняется', () => {
    expect(toMarkdown('<dl><dt><b>aa</b></dt><dd>see <a href="https://e.com">x</a></dd></dl>')).toBe(
      '**aa**\n\nsee [x](https://e.com)\n',
    );
  });

  it('блочное содержимое определения остаётся блочным', () => {
    expect(toMarkdown('<dl><dt>aa</dt><dd><p>one</p><p>two</p></dd></dl>')).toBe(
      'aa\n\none\n\ntwo\n',
    );
  });

  it('список внутри определения остаётся списком', () => {
    expect(toMarkdown('<dl><dt>aa</dt><dd><ul><li>x</li><li>y</li></ul></dd></dl>')).toBe(
      'aa\n\n- x\n- y\n',
    );
  });

  it('пустые <dt>/<dd> ничего не добавляют', () => {
    expect(toMarkdown('<dl><dt>aa</dt><dd></dd></dl>')).toBe('aa\n');
  });

  it('<dl> отделяется от соседних абзацев', () => {
    expect(toMarkdown('<p>before</p><dl><dt>aa</dt><dd>bb</dd></dl><p>after</p>')).toBe(
      'before\n\naa\n\nbb\n\nafter\n',
    );
  });

  // Markdown, которую страница показала как текст, остаётся текстом: `dt` и `dd`
  // уже перечислены в BLOCK_PARENTS парсера, то есть экранирование давно считает
  // их началом строки — теперь это правда и на выходе.
  it('текст страницы не становится разметкой', () => {
    expect(toMarkdown('<dl><dt># term</dt><dd>- def</dd></dl>')).toBe('\\# term\n\n\\- def\n');
  });
});

// A task box belongs to the item that holds it, and to no item above that one.
describe('own task box: a nested checkbox does not mark its parent', () => {
  it('a plain parent holding a task list has no state of its own', () => {
    expect(
      toMarkdown('<ul><li>Eighth item:<ul><li><input type="checkbox" checked> shipped</li></ul></li></ul>'),
    ).toBe('- Eighth item:\n  - [x] shipped\n');
  });

  it('the item that holds the box still gets it', () => {
    expect(toMarkdown('<ul><li><input type="checkbox" checked> done</li></ul>')).toBe('- [x] done\n');
    expect(toMarkdown('<ul><li><input type="checkbox"> todo</li></ul>')).toBe('- [ ] todo\n');
  });
});

// A blank line does not end a list — only a change of delimiter does — so two the
// page drew apart came back as one, and the second one's numbering with it.
describe('neighbouring ordered lists: the delimiter parts them', () => {
  it('two in a row alternate, and each keeps its start', () => {
    const md = toMarkdown('<ol start="7"><li>a</li></ol><ol start="9"><li>b</li><li>c</li></ol>');
    expect(md).toBe('7. a\n\n9) b\n10) c\n');
    // The file alone cannot show this: written with one delimiter throughout, the
    // same text renders as a single list whose second half is renumbered 8, 9.
    const out = render(md);
    expect(out).toContain('<ol start="7">');
    expect(out).toContain('<ol start="9">');
  });

  it('three in a row keep every neighbour apart', () => {
    expect(toMarkdown('<ol><li>a</li></ol><ol start="5"><li>b</li></ol><ol start="9"><li>c</li></ol>')).toBe(
      '1. a\n\n5) b\n\n9. c\n',
    );
  });

  it('a list nobody put a list beside writes the ordinary marker', () => {
    expect(toMarkdown('<p>x</p><ol start="3"><li>a</li></ol>')).toBe('x\n\n3. a\n');
  });
});
