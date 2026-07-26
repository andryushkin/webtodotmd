import type { Rule, MarkItDownOptions } from '../types.js';
import { convert } from '../core/parser.js';

const ELEMENT_NODE = 1;
const ANCHOR_CLASSES = new Set(['anchor', 'heading-link', 'headerlink']);

function isHeadingAnchor(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'a') return false;
  const cls = el.getAttribute('class') ?? '';
  return cls.split(/\s+/).some((c) => ANCHOR_CLASSES.has(c));
}

function getHeadingText(el: Element, options: MarkItDownOptions): string {
  let text = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === ELEMENT_NODE && isHeadingAnchor(child as Element)) continue;
    text += convert(child, options);
  }
  return text.trim();
}

function prefixBlockquote(text: string): string {
  // Normalize internal 3+ newlines before prefixing
  const normalized = text.replace(/\n{3,}/g, '\n\n');
  return normalized
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

export const BLOCK_RULES: Rule[] = [
  {
    name: 'heading',
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement(el, _childContent, options) {
      const text = getHeadingText(el, options);
      if (!text) return '';
      const rawLevel = Number(el.tagName[1]);
      const level = Math.min(Math.max(rawLevel + (options.headingOffset ?? 0), 1), 6);
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    },
  },
  {
    name: 'paragraph',
    filter: ['p'],
    replacement(_el, childContent) {
      const text = childContent.trim();
      if (!text) return '';
      return `\n\n${text}\n\n`;
    },
  },
  {
    name: 'break',
    filter: ['br'],
    replacement: () => '\\\n',
  },
  {
    name: 'hr',
    filter: ['hr'],
    replacement: () => '\n\n---\n\n',
  },
  {
    name: 'blockquote',
    filter: ['blockquote'],
    replacement(_el, childContent) {
      const trimmed = childContent.trim();
      if (!trimmed) return '';
      return `\n\n${prefixBlockquote(trimmed)}\n\n`;
    },
  },
  {
    name: 'div',
    filter: ['div'],
    replacement(_el, childContent) {
      const text = childContent.trim();
      if (!text) return '';
      return `\n\n${text}\n\n`;
    },
  },
];
