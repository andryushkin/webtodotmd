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
    filter: 'pre',
    replacement(el) {
      const clip = el.querySelector('clipboard-copy[value]');
      const codeEl = el.querySelector('code');

      let text: string;
      if (clip) {
        text = clip.getAttribute('value') ?? '';
      } else if (codeEl) {
        removeLineNumbers(codeEl);
        text = codeEl.textContent ?? '';
      } else {
        text = el.textContent ?? '';
      }

      text = text.replace(/\n$/, '');

      const lang = detectLang(codeEl, el);
      const fence = fenceChar(text);
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
    },
  },
];
