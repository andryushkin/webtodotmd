import { describe, it, expect, beforeAll } from 'vitest';
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
