export const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE',
  'PRE', 'TABLE', 'FIGURE', 'TR', 'SECTION', 'ARTICLE', 'DETAILS',
  'UL', 'OL',
]);

export function findHighlightTarget(el: Element): Element {
  let current: Element | null = el;
  while (current) {
    const tag = current.tagName;
    if (tag === 'BODY' || tag === 'HTML') break;
    if (BLOCK_TAGS.has(tag)) return current;
    current = current.parentElement;
  }
  return el;
}
