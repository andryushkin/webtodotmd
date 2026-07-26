import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

// What the reader saw on the page and what they get in the file must match. Before
// this, a page showing `**bold**` as characters produced bold text.
describe('экранирование markdown из текста страницы', () => {
  it.each([
    ['звёздочки', '<p>Use **bold** here</p>', 'Use \\*\\*bold\\*\\* here'],
    ['подчёркивания', '<p>a _b_ c</p>', 'a \\_b\\_ c'],
    ['бэктики', '<p>use `code`</p>', 'use \\`code\\`'],
    ['тильды', '<p>a ~~b~~</p>', 'a \\~\\~b\\~\\~'],
    ['решётка в начале строки', '<p># not a heading</p>', '\\# not a heading'],
    ['маркер списка', '<p>- not a list</p>', '\\- not a list'],
    ['нумерация', '<p>1. not a list</p>', '1\\. not a list'],
    ['цитата', '<p>&gt; not a quote</p>', '\\> not a quote'],
    ['синтаксис ссылки', '<p>Write [text](url)</p>', 'Write \\[text\\](url)'],
    ['обратный слеш', '<p>a \\ b</p>', 'a \\\\ b'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it.each([
    ['одиночная сноска', '<p>see [1] above</p>', 'see [1] above'],
    ['решётка в середине строки', '<p>issue #12 fixed</p>', 'issue #12 fixed'],
    ['дефис в середине', '<p>a - b</p>', 'a - b'],
  ])('не экранирует лишнего: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it.each([
    ['жирный', '<p><strong>bold</strong></p>', '**bold**'],
    ['заголовок', '<h2>Title</h2>', '## Title'],
    ['список', '<ul><li>a</li><li>b</li></ul>', '- a\n- b'],
    ['вложенный список', '<ul><li>a<ul><li>b</li></ul></li></ul>', '- a\n  - b'],
    ['цитата', '<blockquote><p>q</p></blockquote>', '> q'],
    ['ссылка', '<p><a href="https://e.com">t</a></p>', '[t](https://e.com)'],
  ])('настоящая разметка не затронута: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it.each([
    ['блок кода', '<pre><code>a * b _c_</code></pre>', '```\na * b _c_\n```'],
    ['инлайн-код', '<p>use <code>a*b</code></p>', 'use `a*b`'],
  ])('код остаётся дословным: %s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it('LaTeX не экранируется', () => {
    const html =
      '<span class="katex"><annotation encoding="application/x-tex">a_b^*</annotation></span>';
    expect(toMarkdown(html, { math: true }).trim()).toBe('$a_b^*$');
  });
});
