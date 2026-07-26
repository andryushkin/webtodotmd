import type { MarkItDownOptions } from '../types.js';
import { convertChildren } from './parser.js';

export function collectFootnoteDefs(
  root: Element | Document,
  options: MarkItDownOptions,
): Map<string, string> {
  const defs = new Map<string, string>();
  const container = (root as Element).querySelectorAll
    ? (root as Element)
    : ((root as Document).body ?? (root as unknown as Element));
  const items = Array.from(container.querySelectorAll('li[id]'));
  for (const li of items) {
    const id = li.getAttribute('id') ?? '';
    if (!id.startsWith('fn')) continue;
    const key = id.slice(2).replace(/^[-:]/, ''); // "fn1"→"1", "fn-1"→"1"
    const clone = li.cloneNode(true) as Element;
    // Удалить back-link: <a href="#ref..."> или текст с ↩
    for (const a of Array.from(clone.querySelectorAll('a'))) {
      const href = a.getAttribute('href') ?? '';
      const text = a.textContent ?? '';
      if (href.startsWith('#ref') || text.includes('\u21a9')) {
        a.parentNode?.removeChild(a);
      }
    }
    const content = convertChildren(clone, { ...options, footnotes: false }).trim();
    if (content) defs.set(key, content);
  }
  return defs;
}

export function buildFootnotesSection(defs: Map<string, string>): string {
  if (defs.size === 0) return '';
  return (
    Array.from(defs.entries())
      .map(([key, text]) => `[^${key}]: ${text}`)
      .join('\n') + '\n'
  );
}
