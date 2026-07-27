import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
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

  it('start="-2" counts from minus two', () => {
    expect(toMarkdown('<ol start="-2"><li>A</li><li>B</li></ol>')).toBe('-2. A\n-1. B\n');
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
