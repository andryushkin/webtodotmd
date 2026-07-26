import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';

beforeAll(() => {
  setDOMAdapter((html) => parseHTML(html).document as unknown as Document);
});

describe('math', () => {
  it('KaTeX inline — извлекает LaTeX из annotation', () => {
    const html =
      '<span class="katex">' +
      '<span class="katex-mathml">' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
      '<semantics><annotation encoding="application/x-tex">E = mc^2</annotation></semantics>' +
      '</math></span>' +
      '<span class="katex-html" aria-hidden="true">E = mc\u00B2</span>' +
      '</span>';
    const result = toMarkdown(html, { math: true });
    expect(result).toBe('$E = mc^2$\n');
  });

  it('KaTeX display — возвращает $$...$$', () => {
    const html =
      '<span class="katex-display">' +
      '<span class="katex">' +
      '<span class="katex-mathml">' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
      '<semantics><annotation encoding="application/x-tex">\\int_0^\\infty e^{-x} dx</annotation></semantics>' +
      '</math></span>' +
      '<span class="katex-html" aria-hidden="true">\u222B</span>' +
      '</span></span>';
    const result = toMarkdown(html, { math: true });
    expect(result).toBe('$$\\int_0^\\infty e^{-x} dx$$\n');
  });

  it('MathJax v3 — mjx-container с display="true"', () => {
    const html =
      '<mjx-container display="true">' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">' +
      '<semantics><annotation encoding="application/x-tex">\\sum_{n=1}^{\\infty} \\frac{1}{n^2}</annotation></semantics>' +
      '</math></mjx-container>';
    const result = toMarkdown(html, { math: true });
    expect(result).toBe('$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2}$$\n');
  });

  it('MathJax v2 inline — <script type="math/tex">', () => {
    const html = '<script type="math/tex">E = mc^2</script>';
    const result = toMarkdown(html, { math: true });
    expect(result).toBe('$E = mc^2$\n');
  });

  it('MathJax v2 display — <script type="math/tex; mode=display">', () => {
    const html = '<script type="math/tex; mode=display">\\int_0^1 x^2 dx</script>';
    const result = toMarkdown(html, { math: true });
    expect(result).toBe('$$\\int_0^1 x^2 dx$$\n');
  });

  it('Wikipedia <math alttext="..."> с displaystyle', () => {
    const html = '<math alttext="{\\displaystyle E=mc^{2}}"><mi>E</mi></math>';
    const result = toMarkdown(html, { math: true });
    expect(result).toBe('$$E=mc^{2}$$\n');
  });

  it('math: false (по умолчанию) — KaTeX не содержит $ разметки', () => {
    const html =
      '<span class="katex">' +
      '<span class="katex-mathml">' +
      '<math xmlns="http://www.w3.org/1998/Math/MathML">' +
      '<semantics><annotation encoding="application/x-tex">E = mc^2</annotation></semantics>' +
      '</math></span>' +
      '<span class="katex-html" aria-hidden="true">E = mc\u00B2</span>' +
      '</span>';
    const result = toMarkdown(html);
    expect(result).not.toContain('$');
  });
});

// Правило для формул читало имя тега как «буква и дальше буквы с цифрами», а
// пользовательский элемент по спецификации обязан нести дефис — поэтому
// `<x-foo style="position:fixed">` проходил как обычная математика и попадал в
// файл рабочим позиционированным элементом, закрывая собой текст формулы.
describe('дефисные теги в формуле', () => {
  // Формула на странице — это символы, а не разметка: `<` в ней записан
  // сущностью, иначе парсер прочитал бы её как элементы ещё до конвертера.
  const esc = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const katex = (latex: string) =>
    `<span class="katex"><annotation encoding="application/x-tex">${esc(latex)}</annotation></span>`;
  const asText = (latex: string) => toMarkdown(katex(latex), { math: true }).trim();

  it.each([
    ['пользовательский элемент', 'x <x-foo style="position:fixed">X</x-foo> y'],
    ['подчёркивание в имени', 'x <x_foo style="position:fixed">X</x_foo> y'],
    ['цифра и дефис', 'a <ui-1 onclick="alert(1)">b</ui-1> c'],
    ['одиночный самозакрывающийся', 'a <my-el/> b'],
  ])('обезвреживает: %s', (_name, latex) => {
    const md = asText(latex);
    // Оба разделителя, иначе в файле остаётся половина сущности.
    expect(md).not.toContain('<');
    expect(md).not.toContain('>');
    // Текст формулы читатель всё равно видит — уходит только разметка.
    expect(md).toContain('&lt;');
    expect(md).toContain('&gt;');
  });

  it('текст элемента остаётся на месте', () => {
    expect(asText('x <x-foo style="position:fixed">X</x-foo> y')).toBe(
      '$x &lt;x-foo style="position:fixed"&gt;X&lt;/x-foo&gt; y$',
    );
  });

  // Каждое экранирование стоит формулы, поэтому дефис в имени ничего не меняет
  // там, где имени нет вовсе.
  it.each([
    ['неравенство', 'a < b'],
    ['без пробела справа', 'x <y'],
    ['без пробелов', 'a<b'],
    ['меньше либо равно', 'x <= y'],
    ['дробь и неравенство', '\\frac{a}{b} < c'],
    ['минус после переменной', 'a < b-c'],
  ])('не трогает: %s', (_name, latex) => {
    expect(asText(latex)).toBe(`$${latex}$`);
  });
});
