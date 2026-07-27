import { MathMLToLaTeX } from '../../vendor/mathml-to-latex.mjs';
import { escapeMathTags } from '../../core/src/core/escape';
import type { MarkItDownOptions } from '../../core/src/types';

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
      // Same reason as the core's math rules: LaTeX is re-emitted between dollar
      // signs, and Markdown carries raw HTML, so `<img src=x onerror=…>` coming
      // out of MathML would render.
      const safe = escapeMathTags(latex);
      const display = el.getAttribute('display') === 'block';
      return display ? `\n\n$$${safe}$$\n\n` : `$${safe}$`;
    } catch {
      return '';
    }
  },
};

/** The options the content script converts with, shared so tests can match them. */
export const CONVERSION_OPTIONS: MarkItDownOptions = {
  // Not a fixed shift: a capture is a piece of a page, and where its headings
  // start is the page's business. Claude writes an answer under `<h3>`, so
  // `headingOffset: 1` — what this used to be — produced a file whose first
  // heading was `####` with nothing above it, while the reader had seen the
  // topmost heading there is. `#` stays free for the note's own title.
  topHeadingLevel: 2,
  math: true,
  // Neither capture path is ever handed a page: one converts what a drag
  // selected, the other what a click highlighted, and both are a person pointing
  // at something. `'full'` — the library default, and what these paths silently
  // got — deleted a selected `<nav>`, `<header>`, `<footer>` or `<aside>` whole,
  // along with any the drag crossed on its way down the article.
  mode: 'selection',
  rules: [rawMathmlRule],
};
