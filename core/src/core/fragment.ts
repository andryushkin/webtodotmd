import { CONTENTFUL_TAGS, isContentless } from './contentful.js';
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const UNWRAP_TAGS = new Set(['div', 'section', 'article', 'main', 'span', 'figure']);
const CONTENTFUL = new Set<string>(CONTENTFUL_TAGS);

/**
 * Нормализует DocumentFragment после cloneContents():
 * удаляет пустые элементы, раскрывает лишние обёртки,
 * заменяет single-cell таблицы содержимым ячейки,
 * удаляет клонированные id.
 */
// `aria-hidden` used to be stripped here as well, and that strip was the reason
// one product gave two answers about the same attribute: this path deleted it
// before `sanitize()` could see it and kept the text, while `toMarkdown()` —
// which is what the extension's own capture calls — handed the attribute over
// and lost the text. Now that the sanitizer does not read it, nothing in the
// library does: no rule filters on it and the HTML table fallback emits markup
// it builds itself, `colspan` and `rowspan` and nothing else. So the strip
// changed no output at all, and removing an attribute a caller's own rule may
// want to look at is worse than leaving it where the page wrote it. The `id`
// strip stays: those are cloned out of a live document and are duplicates of
// ids still standing in it.
export function normalizeFragment(root: Element): void {
  removeEmptyElements(root);
  unwrapSingleChildContainers(root);
  unwrapSingleCellTables(root);
  Array.from(root.querySelectorAll('[id]')).forEach((el) => el.removeAttribute('id'));
}

function removeEmptyElements(root: Element): void {
  // Повторяем, чтобы убрать вложенные пустые элементы
  for (let pass = 0; pass < 5; pass++) {
    const toRemove: Element[] = [];
    const walker = root.ownerDocument!.createTreeWalker(root, 0x1 /* SHOW_ELEMENT */);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node as Element;
      if (!CONTENTFUL.has(el.tagName.toLowerCase()) && isContentless(el)) toRemove.push(el);
    }
    if (toRemove.length === 0) break;
    for (const el of toRemove) {
      el.parentNode?.removeChild(el);
    }
  }
}


function unwrapSingleChildContainers(root: Element): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const tag of UNWRAP_TAGS) {
      const els = Array.from(root.querySelectorAll(tag));
      for (const el of els) {
        if (!el.parentNode) continue; // уже удалён
        const children = Array.from(el.childNodes).filter(
          (n) => n.nodeType !== TEXT_NODE || (n.textContent ?? '').trim() !== '',
        );
        if (children.length === 1 && children[0]!.nodeType === ELEMENT_NODE) {
          el.replaceWith(children[0]!);
          changed = true;
        }
      }
    }
  }
}

function unwrapSingleCellTables(root: Element): void {
  const tables = Array.from(root.querySelectorAll('table'));
  for (const table of tables) {
    const cells = table.querySelectorAll('td, th');
    if (cells.length === 1) {
      const cell = cells[0]!;
      const wrapper = root.ownerDocument!.createElement('div');
      while (cell.firstChild) {
        wrapper.appendChild(cell.firstChild);
      }
      table.replaceWith(wrapper);
    }
  }
}
