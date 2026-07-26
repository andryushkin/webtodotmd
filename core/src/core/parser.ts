import type { MarkItDownOptions } from '../types.js';
import { findRule } from './rules.js';
import { escapeBlockStarts, escapeInlineMarkdown } from './escape.js';

// Text inside these is emitted verbatim — as a code fence, a code span or LaTeX —
// so escaping it would corrupt the content instead of protecting it.
const LITERAL_TAGS = new Set(['pre', 'code', 'kbd', 'samp', 'math', 'mjx-container', 'annotation']);

// A line begins where a block begins, so `#`, `>`, a bullet or numbering can only
// be mistaken for markup in the text node that opens one of these.
const BLOCK_PARENTS = new Set([
  'p',
  'li',
  'td',
  'th',
  'blockquote',
  'div',
  'section',
  'article',
  'main',
  'dd',
  'dt',
  'figcaption',
  'caption',
]);

function opensBlock(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent || !BLOCK_PARENTS.has(parent.tagName.toLowerCase())) return false;
  for (let prev = node.previousSibling; prev; prev = prev.previousSibling) {
    if (prev.nodeType !== TEXT_NODE || (prev.textContent ?? '').trim() !== '') return false;
  }
  return true;
}

function isLiteralContext(node: Node): boolean {
  let el = node.parentElement;
  while (el) {
    if (LITERAL_TAGS.has(el.tagName.toLowerCase())) return true;
    if (el.classList?.contains('katex')) return true;
    el = el.parentElement;
  }
  return false;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export function convert(node: Node, options: MarkItDownOptions): string {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent ?? '';
    // Markdown the page showed as characters must render as characters.
    if (isLiteralContext(node)) return text;
    const escaped = escapeInlineMarkdown(text);
    return opensBlock(node) ? escapeBlockStarts(escaped) : escaped;
  }
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    const rule = findRule(el, options);
    const childContent = rule.ignoresChildContent ? '' : convertChildren(el, options);
    return rule.replacement(el, childContent, options);
  }
  return '';
}

export function convertChildren(el: Element | Document, options: MarkItDownOptions): string {
  return Array.from(el.childNodes)
    .map((child) => convert(child, options))
    .join('');
}
