import type { MarkItDownOptions } from '../types.js';
import { findRule } from './rules.js';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export function convert(node: Node, options: MarkItDownOptions): string {
  if (node.nodeType === TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    const rule = findRule(el, options);
    const childContent = convertChildren(el, options);
    return rule.replacement(el, childContent, options);
  }
  return '';
}

export function convertChildren(el: Element | Document, options: MarkItDownOptions): string {
  return Array.from(el.childNodes)
    .map((child) => convert(child, options))
    .join('');
}
