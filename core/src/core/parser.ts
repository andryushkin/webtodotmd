import type { MarkItDownOptions } from '../types.js';
import { findRule } from './rules.js';
import { escapeBlockStarts, escapeHtmlSyntax, escapeInlineMarkdown } from './escape.js';

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
    // A <br> ends the line before it, so what follows starts one.
    if (prev.nodeType === ELEMENT_NODE && (prev as Element).tagName.toLowerCase() === 'br') {
      return true;
    }
    if (prev.nodeType !== TEXT_NODE || (prev.textContent ?? '').trim() !== '') return false;
  }
  return true;
}

/** True while writing into an HTML block, where Markdown is not parsed. */
export function isHtmlContext(options: MarkItDownOptions): boolean {
  return options.outputContext === 'html' || options.escapeSyntax === false;
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
    // Markdown the page showed as characters must render as characters — unless
    // this text is headed for an HTML block, where Markdown does not apply.
    if (isHtmlContext(options) || isLiteralContext(node)) return text;
    // HTML escaping comes after the Markdown pass, which doubles backslashes: run
    // the other way round and the `\<` this adds would be doubled into a literal.
    const escaped = escapeHtmlSyntax(escapeInlineMarkdown(text));
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
