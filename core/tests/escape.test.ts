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

  it.each([
    ['тематический разрыв', '<p>---</p>', '\\---'],
    ['setext-подчёркивание', '<p>===</p>', '\\==='],
    ['intraword подчёркивание', '<p>snake_case_name</p>', 'snake_case_name'],
    ['одиночная тильда', '<p>a ~ b</p>', 'a ~ b'],
    ['двойная тильда', '<p>a ~~b~~ c</p>', 'a \\~\\~b\\~\\~ c'],
  ])('%s', (_name, html, expected) => {
    expect(toMarkdown(html).trim()).toBe(expected);
  });

  it('текст после <br> экранируется как начало строки', () => {
    expect(toMarkdown('<p>Intro<br>- item</p>').trim()).toContain('\\- item');
  });

  it('текст ячейки экранируется и в pipe-таблице', () => {
    const html = '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>**bold**</td></tr></tbody></table>';
    expect(toMarkdown(html)).toContain('\\*\\*bold\\*\\*');
  });

  it('в HTML-ячейке синтаксис не экранируется', () => {
    const html = '<table><tr><td colspan="2">snake_case and *lit*</td></tr></table>';
    expect(toMarkdown(html, { complexTableFallback: 'html' })).toContain('<td colspan="2">snake_case and *lit*</td>');
  });

  it('формула в ячейке не может закрыть её', () => {
    const payload = 'x&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;&lt;img src=q onerror="alert(1)"&gt;';
    const html = `<table><tr><td colspan="2"><span class="katex"><annotation encoding="application/x-tex">${payload}</annotation></span></td></tr></table>`;
    const reparsed = parseHTML(toMarkdown(html, { math: true, complexTableFallback: 'html' })).document;
    expect(reparsed.querySelectorAll('img, [onerror]')).toHaveLength(0);
    expect(reparsed.querySelectorAll('td')).toHaveLength(1);
  });

  it.each([
    ['матрица с &', '\\begin{matrix} a & b \\end{matrix}'],
    ['неравенство', 'x < y'],
  ])('LaTeX сохраняется: %s', (_name, latex) => {
    const html = `<span class="katex"><annotation encoding="application/x-tex">${latex}</annotation></span>`;
    expect(toMarkdown(html, { math: true }).trim()).toBe(`$${latex}$`);
  });

  it('LaTeX не экранируется', () => {
    const html =
      '<span class="katex"><annotation encoding="application/x-tex">a_b^*</annotation></span>';
    expect(toMarkdown(html, { math: true }).trim()).toBe('$a_b^*$');
  });
});
