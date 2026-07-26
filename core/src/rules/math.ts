import type { Rule } from '../types.js';

function extractMath(el: Element): { latex: string; display: boolean } | null {
  // 1. <annotation encoding="application/x-tex"> — KaTeX, MathJax v3, Wikipedia
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation?.textContent) {
    const display =
      !!el.closest('.katex-display') ||
      el.getAttribute('display') === 'true' ||
      el.closest('mjx-container')?.getAttribute('display') === 'true';
    return { latex: annotation.textContent.trim(), display };
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
      const cleaned = alttext.replace(/^\{\\displaystyle\s*(.+)\}$/, '$1');
      return { latex: cleaned, display: alttext.includes('\\displaystyle') };
    }
  }
  return null;
}

function toMathString(latex: string, display: boolean): string {
  return display ? `$$${latex}$$` : `$${latex}$`;
}

export const MATH_RULES: Rule[] = [
  {
    name: 'katex',
    filter: (el) => el.classList.contains('katex'),
    replacement: (el) => {
      const result = extractMath(el);
      if (!result) return '';
      return toMathString(result.latex, result.display);
    },
  },
  {
    name: 'mjx-container',
    filter: (el) => el.tagName.toLowerCase() === 'mjx-container',
    replacement: (el) => {
      const result = extractMath(el);
      if (!result) return '';
      return toMathString(result.latex, result.display);
    },
  },
  {
    name: 'math-script-v2',
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
    filter: (el) => el.tagName.toLowerCase() === 'math',
    replacement: (el) => {
      const result = extractMath(el);
      if (!result) return '';
      return toMathString(result.latex, result.display);
    },
  },
];
