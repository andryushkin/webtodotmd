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

// A style command a renderer wraps round the whole formula. Wikipedia's Math
// extension writes one on every formula it publishes — `{\displaystyle …}`, and
// `{\textstyle …}` for the ones the page sets inline: 905 of 905 formulas across
// four articles carry it, 264 of them the `\textstyle` spelling. It instructs the
// renderer and is no part of what the reader was shown, so it does not belong in
// the file. It is no evidence of display either — 407 of those 905 sit on a formula
// the page set inline — which is why taking it off and `isDisplay()` are two things
// and not the one expression they used to be. `\textstyle` settles that on its own:
// it is the same wrapper stating the opposite, and `display` is the attribute that
// answers for both.
const RENDER_STYLE_WRAPPER = /^\{\\(?:display|text)style(?![a-zA-Z])([\s\S]*)\}$/;

/**
 * Takes one renderer wrapper off a formula that is nothing but a wrapper.
 *
 * Anchored at the start, and that anchor is the whole of what keeps
 * `\sum_{\displaystyle i}` intact: a command the formula uses for itself is never
 * the string's first character. The brace balance asks the same question of the
 * other end — `{\displaystyle a}+{\displaystyle b}` matches both anchors, yet the
 * leading brace is closed by the third one, and stripping the pair would emit
 * `a}+{\displaystyle b` with the groups broken.
 *
 * One wrapper comes off, not a run of them. Whatever survives the strip is the
 * article's own source: Wikipedia publishes `{\displaystyle \displaystyle \sum …}`
 * and `{\displaystyle \textstyle f:…}` where the wikitext asked for the command,
 * and that inner one is as much the formula as `\sum` is.
 */
function unwrapRenderStyle(latex: string): string {
  const match = RENDER_STYLE_WRAPPER.exec(latex);
  if (!match) return latex;
  const body = match[1] ?? '';
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    // `\{` and `\}` are braces the formula prints and `\\` is a line break; skipping
    // whatever follows a backslash keeps all three out of the count.
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    if (depth < 0) return latex;
  }
  if (depth !== 0) return latex;
  // `{\displaystyle \gamma }` — 904 of the 905 pad the body on one side or the
  // other, and `$\gamma $` is not the formula the page showed. A body that is
  // nothing but padding is left wrapped: `$$` is a fence, and a wrapper on show
  // costs characters where an empty pair of delimiters costs the line around it.
  return body.trim() || latex;
}

function readMath(el: Element): { latex: string; display: boolean } | null {
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
    if (alttext) return { latex: alttext, display: isDisplay(el) };
  }
  return null;
}

// The wrapper comes off here, once, whichever branch above read the LaTeX. It used
// to come off inside branch 3, which reads an attribute the live shape carries but
// never gets asked for: a real Wikipedia `<math>` holds the same wrapped string in
// `alttext` *and* in an `<annotation>`, branch 1 answers first, and every formula
// on the page reached the file wrapped. KaTeX renders `{\displaystyle E=mc^{2}}` as
// the formula, so the panel looked right and only the saved file was wrong.
function extractMath(el: Element): { latex: string; display: boolean } | null {
  const read = readMath(el);
  if (!read) return null;
  return { latex: unwrapRenderStyle(read.latex), display: read.display };
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
