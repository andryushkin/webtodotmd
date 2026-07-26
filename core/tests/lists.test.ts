import { describe, it, expect, beforeAll } from 'vitest';
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
