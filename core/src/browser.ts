import type { MarkItDownOptions } from './types.js';
import { sanitize } from './core/sanitizer.js';
import { convertChildren } from './core/parser.js';
import { normalize } from './core/normalizer.js';
import { normalizeFragment } from './core/fragment.js';
import { collectFootnoteDefs, buildFootnotesSection } from './core/footnotes.js';

export type { DOMAdapterFn, Rule, MarkItDownOptions } from './types.js';

export function toMarkdown(input: string | Node, options: MarkItDownOptions = {}): string {
  let root: Element | Document;
  if (typeof input === 'string') {
    const adapter =
      options.domAdapter ?? ((html: string) => new DOMParser().parseFromString(html, 'text/html'));
    root = adapter(input);
  } else {
    root = input as Element;
  }

  const footnoteDefs = options.footnotes ? collectFootnoteDefs(root, options) : undefined;

  sanitize(root, 'full', options.math);
  const raw = convertChildren(root as Element, options);
  let result = normalize(raw);

  if (footnoteDefs && footnoteDefs.size > 0) {
    result = result.trimEnd() + '\n\n' + buildFootnotesSection(footnoteDefs);
  }
  return result;
}

/** Универсальный поиск предка по tagName (поднимается вверх от node) */
function findAncestorElement(node: Node, tagName: string): Element | null {
  let current: Node | null = node.nodeType === 1 ? node : (node as Text).parentElement;
  while (current) {
    if ((current as Element).tagName?.toLowerCase() === tagName) return current as Element;
    current = (current as Element).parentElement ?? null;
  }
  return null;
}

/** Возвращает строку-шапку из исходной таблицы — ТОЛЬКО если есть явный <thead> */
function getTableHeaderRow(table: Element): Element | null {
  return table.querySelector('thead tr') ?? null;
}

/**
 * Обходит фрагмент и собирает все <tr> элементы.
 * Случаи:
 *   - commonAncestorContainer = <tbody>  → фрагмент содержит <tr> напрямую
 *   - commonAncestorContainer = <table>  → фрагмент содержит <thead>/<tbody>/<tr>
 *   - commonAncestorContainer = <tr>     → фрагмент содержит <td>/<th>,
 *                                          нужно обернуть в один <tr>
 */
function collectFragmentRows(fragment: DocumentFragment, doc: Document): Element[] {
  const rows: Element[] = [];

  function walk(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === 'tr') {
        rows.push(el);
      } else if (['table', 'thead', 'tbody', 'tfoot'].includes(tag)) {
        walk(child);
      }
    }
  }

  walk(fragment);

  // Если <tr> не нашли — возможно, commonAncestor был <tr>,
  // и фрагмент содержит td/th напрямую → оборачиваем в один <tr>
  if (rows.length === 0) {
    const cells = Array.from(fragment.querySelectorAll('td, th')) as Element[];
    if (cells.length > 0) {
      const tr = doc.createElement('tr');
      for (const cell of cells) tr.appendChild(cell.cloneNode(true));
      rows.push(tr);
    }
  }

  return rows;
}

/** Строит DocumentFragment с таблицей. headerRow может быть null (нет явного thead) */
function buildTableFragment(
  headerRow: Element | null,
  bodyRows: Element[],
  doc: Document,
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  const table = doc.createElement('table');

  if (headerRow) {
    const thead = doc.createElement('thead');
    thead.appendChild(headerRow.cloneNode(true));
    table.appendChild(thead);
  }

  const tbody = doc.createElement('tbody');
  for (const row of bodyRows) tbody.appendChild(row.cloneNode(true));
  table.appendChild(tbody);

  frag.appendChild(table);
  return frag;
}

/**
 * Если range находится внутри таблицы — возвращает обогащённый фрагмент
 * с шапкой оригинальной таблицы + выделенными строками.
 * Если шапка уже входит в выделение — не дублирует.
 * Если range не в таблице — возвращает null (использовать cloneContents()).
 */
function tryEnrichTableFragment(range: Range): DocumentFragment | null {
  const ancestorTable = findAncestorElement(range.commonAncestorContainer, 'table');
  if (!ancestorTable) return null;

  const rawFragment = range.cloneContents();
  const doc = ancestorTable.ownerDocument!;
  const selectedRows = collectFragmentRows(rawFragment, doc);

  if (selectedRows.length === 0) return null;

  const originalHeaderRow = getTableHeaderRow(ancestorTable);

  if (originalHeaderRow) {
    // Проверяем: не выделена ли уже шапка
    const headerText = originalHeaderRow.textContent?.trim() ?? '';
    const firstRowText = selectedRows[0]!.textContent?.trim() ?? '';
    const headerAlreadySelected = headerText !== '' && headerText === firstRowText;

    if (headerAlreadySelected) {
      // Шапка уже есть в выделении — оформляем корректную структуру
      return buildTableFragment(selectedRows[0]!, selectedRows.slice(1), doc);
    }
    // Шапка не выделена — добавляем из оригинала
    return buildTableFragment(originalHeaderRow, selectedRows, doc);
  }

  // Нет <thead> — оборачиваем строки в таблицу без шапки
  return buildTableFragment(null, selectedRows, doc);
}

// ──────────────────────────────────────────────────────────────────────────────
// Расширение выделения и семантическое обогащение фрагментов
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Создаёт копию range, расширяя start/end до ближайших границ слов.
 * Не модифицирует оригинальный Range/Selection пользователя.
 */
function expandRangeToWordBoundaries(range: Range): Range {
  const expanded = range.cloneRange();

  // Expand start backward
  const startNode = range.startContainer;
  if (startNode.nodeType === 3 /* TEXT_NODE */) {
    const text = startNode.textContent ?? '';
    let start = range.startOffset;
    while (start > 0 && /[\p{L}\p{N}]/u.test(text[start - 1]!)) start--;
    if (start !== range.startOffset) expanded.setStart(startNode, start);
  }

  // Expand end forward
  const endNode = range.endContainer;
  if (endNode.nodeType === 3 /* TEXT_NODE */) {
    const text = endNode.textContent ?? '';
    let end = range.endOffset;
    while (end < text.length && /[\p{L}\p{N}]/u.test(text[end]!)) end++;
    if (end !== range.endOffset) expanded.setEnd(endNode, end);
  }

  return expanded;
}

const SEMANTIC_TAGS = new Set([
  'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'li',
  'td', 'th', 'tr', 'tbody', 'thead', 'tfoot', 'table',
]);

/** Возвращает ближайший семантический предок из SEMANTIC_TAGS */
function findNearestSemanticAncestor(node: Node): Element | null {
  let current: Node | null = node.nodeType === 1 ? node : (node as Text).parentElement;
  while (current) {
    const tag = (current as Element).tagName?.toLowerCase();
    if (tag && SEMANTIC_TAGS.has(tag)) return current as Element;
    current = (current as Element).parentElement ?? null;
  }
  return null;
}

function buildPreFragment(range: Range, ancestorPre: Element): DocumentFragment | null {
  const rawFragment = range.cloneContents();
  const selectedText = rawFragment.textContent ?? '';
  if (!selectedText.trim()) return null;

  const doc = ancestorPre.ownerDocument!;
  const codeEl = ancestorPre.querySelector('code');
  const pre = doc.createElement('pre');
  const code = doc.createElement('code');

  // Копируем атрибуты языка для detectLang()
  if (codeEl) {
    const dl = codeEl.getAttribute('data-lang');
    if (dl) code.setAttribute('data-lang', dl);
    const dLang = codeEl.getAttribute('data-language');
    if (dLang) code.setAttribute('data-language', dLang);
    const cls = codeEl.getAttribute('class');
    if (cls) code.setAttribute('class', cls);
  }
  const preCls = ancestorPre.getAttribute('class');
  if (preCls) pre.setAttribute('class', preCls);

  code.textContent = selectedText;
  pre.appendChild(code);

  const frag = doc.createDocumentFragment();
  frag.appendChild(pre);
  return frag;
}

function buildBlockquoteFragment(range: Range, ancestorBq: Element): DocumentFragment | null {
  const rawFragment = range.cloneContents();
  if (!(rawFragment.textContent ?? '').trim()) return null;

  const doc = ancestorBq.ownerDocument!;
  const bq = doc.createElement('blockquote');
  bq.appendChild(rawFragment);

  const frag = doc.createDocumentFragment();
  frag.appendChild(bq);
  return frag;
}

function buildHeadingFragment(range: Range, ancestorH: Element): DocumentFragment | null {
  const rawFragment = range.cloneContents();
  if (!(rawFragment.textContent ?? '').trim()) return null;

  const doc = ancestorH.ownerDocument!;
  const heading = doc.createElement(ancestorH.tagName.toLowerCase());
  heading.appendChild(rawFragment);

  const frag = doc.createDocumentFragment();
  frag.appendChild(heading);
  return frag;
}

function buildListItemFragment(range: Range, ancestorLi: Element): DocumentFragment | null {
  const rawFragment = range.cloneContents();
  if (!(rawFragment.textContent ?? '').trim()) return null;

  const doc = ancestorLi.ownerDocument!;
  const li = doc.createElement('li');
  li.appendChild(rawFragment);

  // Оборачиваем в ul/ol для корректной работы list-item rule (определяет - vs 1.)
  const parentList = ancestorLi.closest('ul, ol');
  const listTag = parentList?.tagName.toLowerCase() ?? 'ul';
  const list = doc.createElement(listTag);
  // Копируем start-атрибут для нумерованных списков
  const start = parentList?.getAttribute('start');
  if (start) list.setAttribute('start', start);
  list.appendChild(li);

  const frag = doc.createDocumentFragment();
  frag.appendChild(list);
  return frag;
}

const TABLE_TAGS = new Set(['td', 'th', 'tr', 'tbody', 'thead', 'tfoot', 'table']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Обобщённый диспетчер: определяет семантический контекст range
 * и возвращает обогащённый фрагмент, или null если контекст неизвестен.
 */
function tryEnrichFragment(range: Range): DocumentFragment | null {
  const ancestor = findNearestSemanticAncestor(range.commonAncestorContainer);
  if (!ancestor) return null;

  const tag = ancestor.tagName.toLowerCase();

  if (tag === 'pre') return buildPreFragment(range, ancestor);
  if (HEADING_TAGS.has(tag)) return buildHeadingFragment(range, ancestor);
  if (tag === 'li') return buildListItemFragment(range, ancestor);
  if (TABLE_TAGS.has(tag)) return tryEnrichTableFragment(range);
  if (tag === 'blockquote') return buildBlockquoteFragment(range, ancestor);

  return null;
}

export function selectionToMarkdown(selection: Selection, options: MarkItDownOptions = {}): string {
  if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') return '';

  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = expandRangeToWordBoundaries(selection.getRangeAt(i));
    const fragment = tryEnrichFragment(range) ?? range.cloneContents();
    container.appendChild(fragment);
  }

  normalizeFragment(container);
  sanitize(container, 'selection', options.math);
  const raw = convertChildren(container, options);
  return normalize(raw);
}
