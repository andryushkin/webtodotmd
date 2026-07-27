import type { Rule } from '../types.js';
import { escapeMathTags } from '../core/escape.js';

// Two attributes are spelled `display` and mean different things, so each question
// has to be put to the element that answers it. On `<math>` it is MathML's own,
// valued `block` or `inline`: Wikipedia writes `block` on a display formula, KaTeX
// writes it on the MathML it builds in display mode, and MathJax's TeX input sets
// it on the root it hands the renderer. `display="true"` is MathJax v3's own
// spelling on its own `<mjx-container>` — it reads `block` off the `<math>` and
// writes `true` onto the container. Asked of the wrong element, each answers about
// nothing: `=== 'true'` on a `<math>` never matched, so a Wikipedia display formula
// came out inline.
function isDisplay(el: Element): boolean {
  const math = el.tagName.toLowerCase() === 'math' ? el : el.querySelector('math');
  if (math?.getAttribute('display') === 'block') return true;
  // A renderer's wrapper says it too, and is the only witness where the MathML is
  // not in the page: MathJax v3 emits `<math>` only under assistive MathML.
  if (el.closest('.katex-display')) return true;
  return el.closest('mjx-container')?.getAttribute('display') === 'true';
}

function extractMath(el: Element): { latex: string; display: boolean } | null {
  // 1. <annotation encoding="application/x-tex"> — KaTeX, MathJax v3, Wikipedia
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation?.textContent) {
    return { latex: annotation.textContent.trim(), display: isDisplay(el) };
  }
  // 2. MathJax v2: <script type="math/tex">
  if (el.tagName.toLowerCase() === 'script') {
    const type = el.getAttribute('type') ?? '';
    if (type.startsWith('math/tex')) {
      return { latex: el.textContent?.trim() ?? '', display: type.includes('mode=display') };
    }
  }
  // 3. Wikipedia <math alttext="...">
  if (el.tagName.toLowerCase() === 'math') {
    const alttext = el.getAttribute('alttext');
    if (alttext) {
      // Wikipedia's Math extension wraps the LaTeX of every formula in
      // `{\displaystyle …}`, inline ones included — it is its own wrapper and does
      // not belong in the file, but it is no evidence of display either. Reading it
      // as evidence gave a formula the reader saw inside a sentence a `$$…$$` of its
      // own, which a renderer centres on a line by itself, cutting the prose around
      // it into fragments. The `display` attribute beside it is what says so.
      const cleaned = alttext.replace(/^\{\\displaystyle\s*(.+)\}$/, '$1');
      return { latex: cleaned, display: isDisplay(el) };
    }
  }
  return null;
}

function toMathString(latex: string, display: boolean): string {
  const safe = escapeMathTags(latex);
  return display ? `$$${safe}$$` : `$${safe}$`;
}

export const MATH_RULES: Rule[] = [
  {
    name: 'katex',
    // The LaTeX comes from the element, so converting the rendered subtree —
    // hundreds of nodes on a Wikipedia or arXiv page — is work thrown away.
    ignoresChildContent: true,
    filter: (el) => el.classList.contains('katex'),
    replacement: (el) => {
      const result = extractMath(el);
      if (!result) return '';
      return toMathString(result.latex, result.display);
    },
  },
  {
    name: 'mjx-container',
    ignoresChildContent: true,
    filter: (el) => el.tagName.toLowerCase() === 'mjx-container',
    replacement: (el) => {
      const result = extractMath(el);
      if (!result) return '';
      return toMathString(result.latex, result.display);
    },
  },
  {
    name: 'math-script-v2',
    ignoresChildContent: true,
    filter: (el) => {
      if (el.tagName.toLowerCase() !== 'script') return false;
      return (el.getAttribute('type') ?? '').startsWith('math/tex');
    },
    replacement: (el) => {
      const result = extractMath(el);
      if (!result) return '';
      return toMathString(result.latex, result.display);
    },
  },
  {
    name: 'math-element',
    ignoresChildContent: true,
    filter: (el) => el.tagName.toLowerCase() === 'math',
    replacement: (el) => {
      const result = extractMath(el);
      if (!result) return '';
      return toMathString(result.latex, result.display);
    },
  },
];
