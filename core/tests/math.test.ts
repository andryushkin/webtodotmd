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

  // The wrapper comes off the LaTeX; it never decided the delimiters — see
  // «display maths: what states it» below.
  it('Wikipedia <math alttext="..."> — снимает обёртку {\\displaystyle …}', () => {
    const html = '<math alttext="{\\displaystyle E=mc^{2}}"><mi>E</mi></math>';
    const result = toMarkdown(html, { math: true });
    expect(result).toBe('$E=mc^{2}$\n');
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

// A reader met these formulas inside a sentence, and got them back as centred
// blocks with the prose cut into fragments between them: the verdict was read from
// `\displaystyle` in Wikipedia's `alttext`, a wrapper its Math extension puts on
// every formula it renders, inline ones included. Each case below is checked
// against what its producer actually writes — KaTeX's `setAttribute("display",
// "block")` under `isDisplayMode`, MathJax v3 translating MathML's `block` into its
// own `display="true"` on the container, and a live Wikipedia article where 12 of
// 31 formulas carry the wrapper without being display.
describe('display maths: what states it', () => {
  const md = (html: string) => toMarkdown(`<body>${html}</body>`, { math: true });

  const wikipedia = (attrs: string) =>
    `<math ${attrs}alttext="{\\displaystyle E=mc^{2}}"><mi>E</mi></math>`;
  const katex = (attrs: string) =>
    '<span class="katex"><span class="katex-mathml">' +
    `<math ${attrs}><semantics><annotation encoding="application/x-tex">E=mc^{2}</annotation>` +
    '</semantics></math></span></span>';

  it('Wikipedia inline остаётся в строке', () => {
    expect(md(`<p>Wikipedia: ${wikipedia('')} in a sentence.</p>`)).toBe(
      'Wikipedia: $E=mc^{2}$ in a sentence.\n',
    );
  });

  it('Wikipedia display="block" — двойные доллары', () => {
    expect(md(`<p>${wikipedia('display="block" ')}</p>`)).toBe('$$E=mc^{2}$$\n');
  });

  // A sentence is the thing the defect broke, so one asserts on a whole sentence.
  it('три формулы в предложении не рвут прозу на куски', () => {
    const sentence = `<p>Since ${wikipedia('')} and ${wikipedia('')}, we get ${wikipedia('')}.</p>`;
    expect(md(sentence)).toBe(
      'Since $E=mc^{2}$ and $E=mc^{2}$, we get $E=mc^{2}$.\n',
    );
  });

  // The live article ships `alttext` *and* an annotation, so the annotation branch
  // answers and the verdict still has to come off the `<math>`. Asserted on the
  // delimiters alone: that branch leaves `{\displaystyle …}` in the LaTeX, which is
  // a separate defect and not this block's subject.
  it.each([
    ['inline', '', '$'],
    ['display', 'display="block" ', '$$'],
  ])('живая разметка Wikipedia (alttext + annotation): %s', (_name, attrs, fence) => {
    const html =
      `<math ${attrs}alttext="{\\displaystyle E=mc^{2}}"><semantics>` +
      '<annotation encoding="application/x-tex">{\\displaystyle E=mc^{2}}</annotation>' +
      '</semantics></math>';
    const out = md(`<p>${html}</p>`).trim();
    expect(out.startsWith(`${fence}{`)).toBe(true);
    expect(out.endsWith(`}${fence}`)).toBe(true);
  });

  // `display="true"` is MathJax's spelling on its own container. On a `<math>` the
  // attribute is MathML's, valued `block` or `inline`, so `true` states nothing —
  // and the code used to read it here and nowhere else.
  it('display="true" на <math> — не разметка MathML, формула остаётся строчной', () => {
    expect(md(`<p>x ${katex('display="true" ')} y</p>`)).toBe('x $E=mc^{2}$ y\n');
  });

  // A bare annotated `<math>` — MathJax's assistive MathML, a KaTeX subtree lifted
  // out of its span — is where the rule asked the `<math>` itself, so it is where
  // both halves of the mix-up were reachable at once: `block` ignored, `true` obeyed.
  it.each([
    ['MathML говорит block', 'display="block" ', '$$E=mc^{2}$$\n'],
    ['MathJax-овское true ничего не значит', 'display="true" ', '$E=mc^{2}$\n'],
    ['без атрибута', '', '$E=mc^{2}$\n'],
  ])('одиночный <math> с annotation: %s', (_name, attrs, expected) => {
    const html =
      `<math ${attrs}><semantics>` +
      '<annotation encoding="application/x-tex">E=mc^{2}</annotation></semantics></math>';
    expect(md(html)).toBe(expected);
  });

  it.each([
    ['KaTeX inline', `<p>x ${katex('')} y</p>`, 'x $E=mc^{2}$ y\n'],
    [
      'KaTeX display — .katex-display',
      `<span class="katex-display">${katex('display="block" ')}</span>`,
      '$$E=mc^{2}$$\n',
    ],
    [
      'mjx-container inline',
      `<p>x <mjx-container>${katex('')}</mjx-container> y</p>`,
      'x $E=mc^{2}$ y\n',
    ],
    [
      'mjx-container display="true"',
      `<mjx-container display="true">${katex('display="block" ')}</mjx-container>`,
      '$$E=mc^{2}$$\n',
    ],
    ['MathJax v2 inline', '<p>x <script type="math/tex">E=mc^2</script> y</p>', 'x $E=mc^2$ y\n'],
    [
      'MathJax v2 display',
      '<script type="math/tex; mode=display">E=mc^2</script>',
      '$$E=mc^2$$\n',
    ],
  ])('остаётся верным: %s', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
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
