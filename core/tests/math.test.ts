import { describe, it, expect, beforeAll } from 'bun:test';
import { parseHTML } from 'linkedom';
import { toMarkdown, setDOMAdapter } from '../src/server.js';
import type { MarkItDownOptions } from '../src/types.js';

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
  // answers and the verdict still has to come off the `<math>`. The wrapper this
  // block was written around no longer reaches the file — see «displaystyle
  // wrapper: comes off whatever carried it» — so the delimiters are asserted on a
  // body that is only the formula.
  it.each([
    ['inline', '', '$E=mc^{2}$'],
    ['display', 'display="block" ', '$$E=mc^{2}$$'],
  ])('живая разметка Wikipedia (alttext + annotation): %s', (_name, attrs, expected) => {
    const html =
      `<math ${attrs}alttext="{\\displaystyle E=mc^{2}}"><semantics>` +
      '<annotation encoding="application/x-tex">{\\displaystyle E=mc^{2}}</annotation>' +
      '</semantics></math>';
    expect(md(`<p>${html}</p>`).trim()).toBe(expected);
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

// Wikipedia's Math extension publishes every formula with a style command wrapped
// round it for its own renderer — `{\displaystyle …}`, or `{\textstyle …}` for the
// ones the page sets inline. Measured over Mass–energy equivalence, Normal
// distribution, Riemann zeta function and Taylor series: 905 of 905 formulas carry
// one, 264 of them the `\textstyle` spelling, and every one repeats the same
// wrapped string in `alttext` and in an `<annotation>`. The strip used to sit on the
// `alttext` branch, which the annotation branch answers before, so all 905 reached
// the file wrapped. KaTeX renders the wrapper as the formula, so the panel showed
// the right thing and only the file a reader pasted elsewhere was wrong.
describe('displaystyle wrapper: comes off whatever carried it', () => {
  const md = (html: string) => toMarkdown(`<body>${html}</body>`, { math: true }).trim();

  /** The live shape: the same wrapped string in the attribute and in the annotation. */
  const wikipedia = (attrs: string, latex: string) =>
    `<math xmlns="http://www.w3.org/1998/Math/MathML" ${attrs}alttext="${latex}">` +
    '<semantics><mrow><mi>E</mi></mrow>' +
    `<annotation encoding="application/x-tex">${latex}</annotation></semantics></math>`;

  it.each([
    ['inline', '', '$E=mc^{2}$'],
    ['display', 'display="block" ', '$$E=mc^{2}$$'],
  ])(
    'live Wikipedia carries both, and the file gets neither wrapper: %s',
    (_n, attrs, expected) => {
      expect(md(wikipedia(attrs, '{\\displaystyle E=mc^{2}}'))).toBe(expected);
    },
  );

  // `\textstyle` is the same wrapper stating the opposite, and 264 of the 905 use
  // it — leaving it in leaks the identical nine characters of foreign syntax.
  it.each([
    ['annotation and alttext', wikipedia('', '{\\textstyle \\sigma {\\sqrt {2/\\pi }}}')],
    ['alttext alone', '<math alttext="{\\textstyle \\sigma {\\sqrt {2/\\pi }}}"><mi>s</mi></math>'],
  ])('\\textstyle is a wrapper too: %s', (_name, html) => {
    expect(md(html)).toBe('$\\sigma {\\sqrt {2/\\pi }}$');
  });

  // Every branch, because the wrapper is taken off once for all of them rather than
  // beside the one that happens to read an attribute.
  it.each([
    [
      'KaTeX annotation',
      '<span class="katex"><annotation encoding="application/x-tex">' +
        '{\\displaystyle E=mc^{2}}</annotation></span>',
      '$E=mc^{2}$',
    ],
    [
      'mjx-container',
      '<mjx-container display="true"><math display="block"><semantics>' +
        '<annotation encoding="application/x-tex">{\\displaystyle E=mc^{2}}</annotation>' +
        '</semantics></math></mjx-container>',
      '$$E=mc^{2}$$',
    ],
    [
      'MathJax v2 script',
      '<script type="math/tex">{\\displaystyle E=mc^{2}}</script>',
      '$E=mc^{2}$',
    ],
    [
      'bare <math alttext>',
      '<math alttext="{\\displaystyle E=mc^{2}}"><mi>E</mi></math>',
      '$E=mc^{2}$',
    ],
  ])('every source it can arrive through: %s', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });

  // The `display` attribute is what states display, and it still is: `\textstyle`
  // says inline and loses to a `<math display="block">`, which is what keeps the
  // strip and the verdict two things rather than the one expression they were.
  it('the wrapper never votes on the delimiters', () => {
    expect(md(wikipedia('display="block" ', '{\\textstyle E=mc^{2}}'))).toBe('$$E=mc^{2}$$');
  });

  // What the start anchor buys: a command the formula uses for itself is never the
  // string's first character, so no amount of `\displaystyle` inside it is a wrapper.
  it.each([
    ['inside a subscript', '\\sum_{\\displaystyle i} x'],
    ['inside a group', 'a + {\\textstyle b} + c'],
    ['not at the start', 'x \\displaystyle y'],
  ])('a style command the formula owns survives: %s', (_name, latex) => {
    expect(md(`<math alttext="${latex}"><mi>x</mi></math>`)).toBe(`$${latex}$`);
  });

  // Both anchors match and the braces still do not pair: the leading one is closed
  // by the third, so stripping the pair would emit `a}+{\displaystyle b`.
  it('two wrapped groups side by side are not one wrapper', () => {
    const latex = '{\\displaystyle a}+{\\displaystyle b}';
    expect(md(`<math alttext="${latex}"><mi>a</mi></math>`)).toBe(`$${latex}$`);
  });

  // One wrapper comes off, not a run of them. Wikipedia writes these where the
  // wikitext asked for the command, and that inner one is part of the formula.
  it.each([
    [
      '\\displaystyle',
      '{\\displaystyle \\displaystyle \\sum _{n=0}^{\\infty }x^{n}}',
      '$\\displaystyle \\sum _{n=0}^{\\infty }x^{n}$',
    ],
    [
      '\\textstyle',
      '{\\displaystyle \\textstyle f:\\mathbb {R} \\to \\mathbb {R} }',
      '$\\textstyle f:\\mathbb {R} \\to \\mathbb {R}$',
    ],
    ['a braced one', '{\\displaystyle {\\displaystyle x}}', '${\\displaystyle x}$'],
  ])('what survives the strip is the formula, not a second wrapper: %s', (_n, latex, expected) => {
    expect(md(`<math alttext="${latex}"><mi>x</mi></math>`)).toBe(expected);
  });

  it.each([
    ['both sides padded', '{\\displaystyle  \\gamma  }', '$\\gamma$'],
    ['trailing only, as Wikipedia writes it', '{\\displaystyle \\gamma }', '$\\gamma$'],
    ['escaped braces are characters, not grouping', '{\\displaystyle a\\}b}', '$a\\}b$'],
  ])('the body arrives without the padding: %s', (_name, latex, expected) => {
    expect(md(`<math alttext="${latex}"><mi>g</mi></math>`)).toBe(expected);
  });

  // A wrapper on show costs characters; an empty pair of delimiters costs the line
  // around it, and a longer command that merely starts the same way is not a wrapper.
  it.each([
    ['nothing inside it', '{\\displaystyle }'],
    ['nothing at all inside it', '{\\displaystyle}'],
    ['a different command', '{\\displaystyleish x}'],
  ])('left alone: %s', (_name, latex) => {
    expect(md(`<math alttext="${latex}"><mi>x</mi></math>`)).toBe(`$${latex}$`);
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
    // Оба разделителя, иначе оставшийся `>` закрывает тег, который `<` уже не
    // открывает.
    expect(md).not.toContain('<');
    expect(md).not.toContain('>');
    // LaTeX'овы имена этих символов, а не HTML-сущности: сущность для KaTeX —
    // ошибка, и формула, ставшая безопасной, становилась нечитаемой.
    expect(md).toContain('\\lt');
    expect(md).toContain('\\gt');
  });

  it('текст элемента остаётся на месте', () => {
    expect(asText('x <x-foo style="position:fixed">X</x-foo> y')).toBe(
      '$x \\lt x-foo style="position:fixed"\\gt X\\lt /x-foo\\gt  y$',
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

// What a capture of a maths page handed the reader instead of the formula. The
// LaTeX lives in a twin the renderer hides beside the drawing, `.sr-only` is the
// shape it is hidden with, and the sanitizer read that shape as hidden content:
// a KaTeX formula came out of the capture as nothing at all, and a Wikipedia one
// as a link to a picture of itself, its alt text carrying the `{\displaystyle …}`
// wrapper the converter had just learned to take off the formula.
describe('math carrier: a hidden twin reaches the file', () => {
  const md = (html: string, options: MarkItDownOptions = { math: true }) =>
    toMarkdown(html, options);

  const SR_ONLY = 'clip:rect(1px,1px,1px,1px);position:absolute;width:1px;height:1px;opacity:0';
  const PINHOLE =
    'clip:rect(1px, 1px, 1px, 1px);position:absolute;width:1px;height:1px;overflow:hidden';

  const katex = (attrs: string) =>
    '<p>x <span class="katex">' +
    `<span class="katex-mathml"${attrs}><math><semantics><mrow><mi>E</mi></mrow>` +
    '<annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span>' +
    '<span class="katex-html" aria-hidden="true">E=mc²</span></span> y</p>';

  const mathjax3 = (attrs: string) =>
    '<p>x <mjx-container class="MathJax" jax="CHTML" style="position: relative;">' +
    '<mjx-math aria-hidden="true">E=mc2</mjx-math>' +
    `<mjx-assistive-mml unselectable="on" display="inline"${attrs}>` +
    '<math><semantics><mrow><mi>E</mi></mrow>' +
    '<annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math>' +
    '</mjx-assistive-mml></mjx-container> y</p>';

  // The live Wikipedia construct: one wrapper holding the invisible `<math>` and
  // the picture of it, both inside a link to Wikidata. `display` is written on
  // the `<math>`, so the same markup states inline and block.
  const wikipedia = (attrs: string, display = '') =>
    '<p>x <span class="mwe-math-element mwe-math-element-inline">' +
    '<a href="/w/index.php?title=Special:MathWikibase&amp;qid=Q35875" style="color:inherit;">' +
    `<span class="mwe-math-mathml-inline mwe-math-mathml-a11y"${attrs}>` +
    `<math ${display}alttext="{\\displaystyle E=mc^{2}}"><semantics><mrow><mi>E</mi></mrow>` +
    '<annotation encoding="application/x-tex">{\\displaystyle E=mc^{2}}</annotation>' +
    '</semantics></math></span>' +
    '<img src="https://wikimedia.org/api/rest_v1/media/math/render/svg/9f73" ' +
    'class="mwe-math-fallback-image-inline" aria-hidden="true" ' +
    'alt="{\\displaystyle E=mc^{2}}"></a></span> y</p>';

  it.each([
    ['KaTeX, style attribute', katex(` style="${SR_ONLY}"`), 'x $E=mc^2$ y\n'],
    ['KaTeX, snapshot attribute', katex(` data-s2md-style="${SR_ONLY}"`), 'x $E=mc^2$ y\n'],
    ['MathJax v3, style attribute', mathjax3(` style="${SR_ONLY}"`), 'x $E=mc^2$ y\n'],
    ['MathJax v3, snapshot attribute', mathjax3(` data-s2md-style="${PINHOLE}"`), 'x $E=mc^2$ y\n'],
    [
      'Wikipedia as served, style attribute',
      wikipedia(' style="display: none;"'),
      'x $E=mc^{2}$ y\n',
    ],
    [
      'Wikipedia captured, snapshot over the attribute',
      wikipedia(` style="display: none;" data-s2md-style="${PINHOLE}"`),
      'x $E=mc^{2}$ y\n',
    ],
  ])('the formula, not what was left of it: %s', (_name, html, expected) => {
    expect(md(html)).toBe(expected);
  });

  // Wikipedia publishes both halves of every formula, so once the carrier
  // survives, both convert: the base already wrote `$E=mc^{2}$` beside the
  // picture wherever the `<math>` was not hidden. The reader saw one formula.
  //
  // Settled on the wrapper, the way `.katex` and `<mjx-container>` already are,
  // because the wrapper is the only element that knows the two are one thing —
  // and because it holds whichever fallback the Math extension chose. A rule that
  // refused the image would still have to be told about
  // `mwe-math-fallback-source-*`, the TeX-as-text fallback, and about the next
  // one the extension adds.
  it.each([
    ['carrier hidden', wikipedia(' style="display: none;"')],
    ['carrier not hidden', wikipedia('')],
  ])('one formula rather than a formula and a picture: %s', (_name, html) => {
    const out = md(html);
    expect(out).toBe('x $E=mc^{2}$ y\n');
    expect(out).not.toContain('![');
    expect(out).not.toContain('wikimedia.org');
  });

  // The delimiters come off the `<math display="block">` the wrapper holds, which
  // is the element MathML's own attribute belongs to. Whether the formula also
  // opens a line is the wrapper's `display` and nothing to do with this: Wikipedia
  // makes `.mwe-math-element-block` a block only under a max-width media query, so
  // a capture from a wide window really does leave it in the line.
  it('a display formula keeps its own delimiters through the wrapper', () => {
    expect(md(wikipedia(' style="display: none;"', 'display="block" '))).toBe(
      'x $$E=mc^{2}$$ y\n',
    );
  });

  // In `source` mode the Math extension publishes no MathML at all, only the TeX
  // as text. The wrapper rule asks for a formula it can read before claiming the
  // element, because claiming it with nothing to read would emit the empty string
  // and delete the only thing the reader was shown.
  it('a wrapper with no formula in it keeps what the page displayed', () => {
    const html =
      '<p>x <span class="mwe-math-element mwe-math-element-inline">' +
      '<span class="mwe-math-fallback-source-inline">E = mc^2</span></span> y</p>';
    expect(md(html)).toBe('x E = mc^2 y\n');
  });

  // The exemption is for the carrier inside a visible formula, not for the
  // formula: the construct here is hidden twin, drawing and all.
  it('a formula the page hid whole is still not in the file', () => {
    expect(md(`<div style="display:none">${katex('')}</div><p>after</p>`)).toBe('after\n');
  });

  it('an ordinary .sr-only paragraph beside a formula is still not in the file', () => {
    expect(md(`<p style="${SR_ONLY}">Skip to main content</p>${katex('')}`)).toBe(
      'x $E=mc^2$ y\n',
    );
  });

  // With `math` off every one of these converts exactly as it did before: the
  // carrier goes, and Wikipedia's picture is what is left of the formula.
  it.each([
    ['KaTeX', katex(` style="${SR_ONLY}"`), 'x E=mc² y\n'],
    ['MathJax v3', mathjax3(` style="${SR_ONLY}"`), 'x E=mc2 y\n'],
    [
      'Wikipedia',
      wikipedia(' style="display: none;"'),
      'x [![{\\\\displaystyle E=mc^{2}}](https://wikimedia.org/api/rest_v1/media/math/render/svg/9f73)]' +
        '(/w/index.php?title=Special:MathWikibase&qid=Q35875) y\n',
    ],
  ])('with math off nothing changes: %s', (_name, html, expected) => {
    expect(md(html, {})).toBe(expected);
  });
});
