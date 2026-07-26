import { describe, it, expect, beforeAll } from 'vitest';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';
import { normalizeFragment } from '../src/core/fragment.js';

// Хелпер: создаёт div-контейнер через linkedom, имитируя cloneContents()
function makeContainer(innerHTML: string): Element {
  const { document } = parseHTML(`<html><body><div id="root">${innerHTML}</div></body></html>`);
  return document.getElementById('root') as unknown as Element;
}

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

// ──────────────────────────────────────────────────────────────────────────────
// normalizeFragment — unit-тесты
// ──────────────────────────────────────────────────────────────────────────────

describe('normalizeFragment: unwrapSingleChildContainers', () => {
  it('single-child div → разворачивает до вложенного элемента', () => {
    const container = makeContainer('<div><p>Hello</p></div>');
    normalizeFragment(container);
    // div должен быть развёрнут — остаётся только <p>
    expect(container.querySelector('div')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('Hello');
  });

  it('несколько уровней обёрток → все разворачиваются', () => {
    const container = makeContainer('<div><section><article><p>Text</p></article></section></div>');
    normalizeFragment(container);
    expect(container.querySelector('div')).toBeNull();
    expect(container.querySelector('section')).toBeNull();
    expect(container.querySelector('article')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe('Text');
  });

  it('несколько детей → не разворачивает', () => {
    const container = makeContainer('<div><p>A</p><p>B</p></div>');
    normalizeFragment(container);
    // div с двумя детьми остаётся
    expect(container.querySelector('div')).not.toBeNull();
  });

  it('span с одним элементом → разворачивает', () => {
    const container = makeContainer('<span><strong>bold</strong></span>');
    normalizeFragment(container);
    expect(container.querySelector('span')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });
});

describe('normalizeFragment: unwrapSingleCellTables', () => {
  it('таблица из одной ячейки → заменяется содержимым ячейки', () => {
    const container = makeContainer(
      '<table><tbody><tr><td>выделенный текст</td></tr></tbody></table>',
    );
    normalizeFragment(container);
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).toContain('выделенный текст');
  });

  it('таблица с несколькими ячейками → остаётся', () => {
    const container = makeContainer('<table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>');
    normalizeFragment(container);
    expect(container.querySelector('table')).not.toBeNull();
  });
});

describe('normalizeFragment: removeEmptyElements', () => {
  it('пустой p → удаляется', () => {
    const container = makeContainer('<p></p><p>Real text</p>');
    normalizeFragment(container);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0]?.textContent).toBe('Real text');
  });

  it('пустой div → удаляется', () => {
    const container = makeContainer('<div></div><p>Text</p>');
    normalizeFragment(container);
    expect(container.querySelector('div')).toBeNull();
  });

  it('элемент с пробелами → удаляется', () => {
    const container = makeContainer('<span>   </span><p>Content</p>');
    normalizeFragment(container);
    // span только с пробелами — пустой
    expect(container.querySelector('span')).toBeNull();
  });

  it('элемент с img → не удаляется', () => {
    const container = makeContainer('<div><img src="x.jpg" alt="photo"></div>');
    normalizeFragment(container);
    expect(container.querySelector('img')).not.toBeNull();
  });
});

describe('normalizeFragment: удаление атрибутов', () => {
  it('id атрибут удаляется', () => {
    const container = makeContainer('<h2 id="section-1">Заголовок</h2>');
    normalizeFragment(container);
    expect(container.querySelector('[id]')).toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe('Заголовок');
  });

  it('aria-hidden атрибут удаляется', () => {
    const container = makeContainer('<span aria-hidden="true">icon</span><p>Text</p>');
    normalizeFragment(container);
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });

  it('несколько id → все удаляются', () => {
    const container = makeContainer('<div id="a"><p id="b">Text</p></div>');
    normalizeFragment(container);
    expect(container.querySelectorAll('[id]').length).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// selectionToMarkdown pipeline — тестируем через toMarkdown с HTML-фрагментами,
// имитирующими вывод cloneContents()
// ──────────────────────────────────────────────────────────────────────────────

describe('selectionToMarkdown pipeline (через toMarkdown + normalizeFragment вручную)', () => {
  // Вспомогательная функция: имитирует полный pipeline selectionToMarkdown
  // используя toMarkdown + normalizeFragment на div-контейнере.
  function selectionPipeline(innerHTML: string, options = {}): string {
    const container = makeContainer(innerHTML);
    normalizeFragment(container);
    return toMarkdown(container as unknown as Node, options);
  }

  it('параграф с bold → "**text**"', () => {
    const result = selectionPipeline('<p><strong>важный</strong> текст</p>');
    expect(result).toBe('**важный** текст\n');
  });

  it('простой параграф', () => {
    const result = selectionPipeline('<p>Просто текст</p>');
    expect(result).toBe('Просто текст\n');
  });

  it('частичный список', () => {
    const result = selectionPipeline('<ul><li>Первый</li><li>Второй</li></ul>');
    expect(result).toBe('- Первый\n- Второй\n');
  });

  it('вложенные контейнеры разворачиваются → нет лишних переносов', () => {
    const result = selectionPipeline('<div><section><p>Просто текст</p></section></div>');
    expect(result).toBe('Просто текст\n');
  });

  it('single-cell таблица → просто текст без табличного синтаксиса', () => {
    const result = selectionPipeline(
      '<table><tbody><tr><td>выделенный текст</td></tr></tbody></table>',
    );
    expect(result).toBe('выделенный текст\n');
    expect(result).not.toContain('|');
  });

  it('заголовок с id → id удалён, заголовок конвертируется', () => {
    const result = selectionPipeline('<h2 id="section-1">Заголовок раздела</h2>');
    expect(result).toBe('## Заголовок раздела\n');
  });

  it('headingOffset: h1 → h2', () => {
    const result = selectionPipeline('<h1>Большой заголовок</h1>', { headingOffset: 1 });
    expect(result).toBe('## Большой заголовок\n');
  });

  it('headingOffset: h1 → h3', () => {
    const result = selectionPipeline('<h1>Title</h1>', { headingOffset: 2 });
    expect(result).toBe('### Title\n');
  });

  it('headingOffset: h6 + offset не выходит за 6', () => {
    const result = selectionPipeline('<h6>Deep</h6>', { headingOffset: 2 });
    expect(result).toBe('###### Deep\n');
  });

  it('пустой фрагмент → пустая строка после нормализации', () => {
    const result = selectionPipeline('');
    // toMarkdown вернёт пустую строку или только \n — проверяем что нет реального контента
    expect(result.trim()).toBe('');
  });

  it('несколько элементов', () => {
    const result = selectionPipeline('<p>Первый</p><p>Второй</p>');
    expect(result).toBe('Первый\n\nВторой\n');
  });

  it('inline элементы: em и code', () => {
    const result = selectionPipeline('<p><em>курсив</em> и <code>код</code></p>');
    expect(result).toBe('_курсив_ и `код`\n');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// table selection enrichment (через selectionPipeline)
// ──────────────────────────────────────────────────────────────────────────────

describe('table selection enrichment (через selectionPipeline)', () => {
  function selectionPipeline(innerHTML: string, options = {}): string {
    const container = makeContainer(innerHTML);
    normalizeFragment(container);
    return toMarkdown(container as unknown as Node, options);
  }

  it('строки таблицы с шапкой → markdown-таблица', () => {
    const result = selectionPipeline(
      '<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>foo</td><td>42</td></tr></tbody></table>',
    );
    expect(result).toContain('| Name');
    expect(result).toContain('| foo');
    expect(result).toContain('---');
  });

  it('две строки tbody с шапкой → полная таблица', () => {
    const result = selectionPipeline(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table>',
    );
    expect(result).toContain('| A');
    expect(result).toContain('| 1');
    expect(result).toContain('| 3');
  });

  it('таблица без thead → таблица без шапки (строки данных)', () => {
    const result = selectionPipeline(
      '<table><tbody><tr><td>X</td><td>Y</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(result).toContain('| X');
    expect(result).toContain('| 1');
  });

  it('таблица с одной строкой данных и шапкой → не схлопывается в текст', () => {
    const result = selectionPipeline(
      '<table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody><tr><td>val1</td><td>val2</td></tr></tbody></table>',
    );
    expect(result).toContain('| Col1');
    expect(result).toContain('| val1');
    expect(result).toContain('---');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Enrichment: pre/code partial selection
// ──────────────────────────────────────────────────────────────────────────────

describe('enrichment: pre/code partial selection', () => {
  function selectionPipeline(innerHTML: string, options = {}): string {
    const container = makeContainer(innerHTML);
    normalizeFragment(container);
    return toMarkdown(container as unknown as Node, options);
  }

  it('текст внутри <pre><code> → code fence', () => {
    const result = selectionPipeline('<pre><code>const x = 1;</code></pre>');
    expect(result).toContain('```');
    expect(result).toContain('const x = 1;');
  });

  it('язык из class language-js → указывается в fence', () => {
    const result = selectionPipeline('<pre><code class="language-js">const x = 1;</code></pre>');
    expect(result).toContain('```js');
    expect(result).toContain('const x = 1;');
  });

  it('язык из data-lang → указывается в fence', () => {
    const result = selectionPipeline('<pre><code data-lang="python">x = 1</code></pre>');
    expect(result).toContain('```python');
    expect(result).toContain('x = 1');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Enrichment: blockquote partial selection
// ──────────────────────────────────────────────────────────────────────────────

describe('enrichment: blockquote partial selection', () => {
  function selectionPipeline(innerHTML: string, options = {}): string {
    const container = makeContainer(innerHTML);
    normalizeFragment(container);
    return toMarkdown(container as unknown as Node, options);
  }

  it('текст внутри <blockquote> → blockquote prefix', () => {
    const result = selectionPipeline('<blockquote><p>Цитата</p></blockquote>');
    expect(result).toContain('> Цитата');
  });

  it('multi-paragraph blockquote → все строки с префиксом', () => {
    const result = selectionPipeline(
      '<blockquote><p>Первая строка</p><p>Вторая строка</p></blockquote>',
    );
    const lines = result.split('\n').filter((l) => l.trim());
    expect(lines.every((l) => l.startsWith('>'))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Enrichment: heading partial selection
// ──────────────────────────────────────────────────────────────────────────────

describe('enrichment: heading partial selection', () => {
  function selectionPipeline(innerHTML: string, options = {}): string {
    const container = makeContainer(innerHTML);
    normalizeFragment(container);
    return toMarkdown(container as unknown as Node, options);
  }

  it('текст внутри <h2> → ## heading', () => {
    const result = selectionPipeline('<h2>Заголовок второго уровня</h2>');
    expect(result).toBe('## Заголовок второго уровня\n');
  });

  it('текст внутри <h3> → ### heading', () => {
    const result = selectionPipeline('<h3>Заголовок третьего</h3>');
    expect(result).toBe('### Заголовок третьего\n');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Enrichment: list item partial selection
// ──────────────────────────────────────────────────────────────────────────────

describe('enrichment: list item partial selection', () => {
  function selectionPipeline(innerHTML: string, options = {}): string {
    const container = makeContainer(innerHTML);
    normalizeFragment(container);
    return toMarkdown(container as unknown as Node, options);
  }

  it('текст внутри <li> в <ul> → "- item"', () => {
    const result = selectionPipeline('<ul><li>Пункт списка</li></ul>');
    expect(result).toBe('- Пункт списка\n');
  });

  it('текст внутри <li> в <ol> → "1. item"', () => {
    const result = selectionPipeline('<ol><li>Нумерованный пункт</li></ol>');
    expect(result).toMatch(/^1\. Нумерованный пункт\n$/);
  });
});
