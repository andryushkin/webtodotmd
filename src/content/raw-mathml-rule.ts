import { MathMLToLaTeX } from '../../vendor/mathml-to-latex.mjs';

// MathML that carries no LaTeX of its own — no `alttext`, no `<annotation>` — is
// converted here instead of by the core, which only reads LaTeX that the page
// already provides. It lives in its own module because a test cannot import
// content-script.ts: that file calls Chrome APIs at the top level.
export const rawMathmlRule = {
  name: 'raw-mathml',
  filter: (el: Element) => {
    if (el.tagName.toLowerCase() !== 'math') return false;
    if (el.getAttribute('alttext')) return false; // Wikipedia handled by MATH_RULES
    if (el.querySelector('annotation[encoding="application/x-tex"]')) return false;
    return true;
  },
  replacement: (el: Element) => {
    try {
      const latex = MathMLToLaTeX.convert(el.outerHTML);
      if (!latex) return '';
      const display = el.getAttribute('display') === 'block';
      return display ? `\n\n$$${latex}$$\n\n` : `$${latex}$`;
    } catch {
      return '';
    }
  },
};

/** The options the content script converts with, shared so tests can match them. */
export const CONVERSION_OPTIONS = {
  headingOffset: 1,
  math: true,
  rules: [rawMathmlRule],
} as const;
