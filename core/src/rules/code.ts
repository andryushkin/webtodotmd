import type { Rule } from '../types.js';

// Языковые паттерны §6.3
const LANG_PATTERNS = [
  /\blanguage-(\w+)\b/, // Prism.js, HTML5
  /\blang-(\w+)\b/, // highlight.js, SO
  /\bhighlight-source-(\w+)\b/, // GitHub
  /\bbrush:\s*(\w+)\b/, // SyntaxHighlighter
  /\bsourceCode\s+(\w+)\b/, // Pandoc
  /\bshj-lang-(\w+)\b/, // Speed Highlight JS
  /\bprettyprint\s+lang-(\w+)\b/, // Google Code Prettify
];

// Классы нумерации строк §6.4
const LINE_NUMBER_CLASSES = new Set(['line-numbers-rows', 'linenumber', 'line-number', 'hljs-ln']);

function detectLang(codeEl: Element | null, preEl: Element): string {
  if (codeEl) {
    const dl = codeEl.getAttribute('data-lang') ?? codeEl.getAttribute('data-language');
    if (dl) return dl.trim();
  }
  for (const target of [codeEl, preEl]) {
    if (!target) continue;
    const cls = target.getAttribute('class') ?? '';
    for (const re of LANG_PATTERNS) {
      const m = re.exec(cls);
      if (m?.[1]) return m[1];
    }
  }
  return '';
}

function removeLineNumbers(el: Element): void {
  for (const child of Array.from(el.children)) {
    const cls = child.getAttribute('class') ?? '';
    if (cls.split(/\s+/).some((c) => LINE_NUMBER_CLASSES.has(c))) {
      child.remove();
    }
  }
}

// `textContent` reads a <br> as nothing, so a <pre> that breaks its lines with
// them — plenty do, and so does anything that pasted HTML into a code sample —
// collapsed into one unreadable line. Read from a clone: the page's own DOM must
// come back unchanged.
function textWithLineBreaks(el: Element): string {
  if (!el.querySelector('br')) return el.textContent ?? '';
  const clone = el.cloneNode(true) as Element;
  for (const br of Array.from(clone.querySelectorAll('br'))) {
    br.replaceWith(clone.ownerDocument!.createTextNode('\n'));
  }
  return clone.textContent ?? '';
}

function fenceChar(text: string): string {
  let max = 2; // минимум 3 бэктика
  for (const m of text.matchAll(/`+/g)) {
    if (m[0].length > max) max = m[0].length;
  }
  return '`'.repeat(max + 1);
}

export const CODE_RULES: Rule[] = [
  {
    name: 'fenced-code-block',
    // The fence is built from el.textContent; the subtree's Markdown is unused.
    ignoresChildContent: true,
    filter: 'pre',
    replacement(el) {
      const clip = el.querySelector('clipboard-copy[value]');
      const codeEl = el.querySelector('code');

      let text: string;
      if (clip) {
        text = clip.getAttribute('value') ?? '';
      } else if (codeEl) {
        removeLineNumbers(codeEl);
        text = textWithLineBreaks(codeEl);
      } else {
        text = textWithLineBreaks(el);
      }

      text = text.replace(/\n$/, '');

      const lang = detectLang(codeEl, el);
      const fence = fenceChar(text);
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
    },
  },
];
