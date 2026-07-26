const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const UNWRAP_TAGS = new Set(['div', 'section', 'article', 'main', 'span', 'figure']);
const MEDIA_TAGS = new Set(['img', 'video', 'audio', 'canvas', 'picture', 'figure']);

/**
 * Нормализует DocumentFragment после cloneContents():
 * удаляет пустые элементы, раскрывает лишние обёртки,
 * заменяет single-cell таблицы содержимым ячейки,
 * удаляет клонированные id и aria-hidden.
 */
export function normalizeFragment(root: Element): void {
  removeEmptyElements(root);
  unwrapSingleChildContainers(root);
  unwrapSingleCellTables(root);
  Array.from(root.querySelectorAll('[id]')).forEach((el) => el.removeAttribute('id'));
  Array.from(root.querySelectorAll('[aria-hidden]')).forEach((el) =>
    el.removeAttribute('aria-hidden'),
  );
}

function removeEmptyElements(root: Element): void {
  // Повторяем, чтобы убрать вложенные пустые элементы
  for (let pass = 0; pass < 5; pass++) {
    const toRemove: Element[] = [];
    const walker = root.ownerDocument!.createTreeWalker(root, 0x1 /* SHOW_ELEMENT */);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const el = node as Element;
      if (!MEDIA_TAGS.has(el.tagName.toLowerCase()) && isEmpty(el)) toRemove.push(el);
    }
    if (toRemove.length === 0) break;
    for (const el of toRemove) {
      el.parentNode?.removeChild(el);
    }
  }
}

function isEmpty(el: Element): boolean {
  if ((el.textContent ?? '').trim() !== '') return false;
  for (const tag of MEDIA_TAGS) {
    if (el.querySelector(tag)) return false;
  }
  return true;
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
