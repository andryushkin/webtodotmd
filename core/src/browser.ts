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

// Temporary marks, so a cloned node can be matched back to the original it came
// from: a clone carries no such link, and both repairs below need one. Every
// setter is paired with a `finally` — touching the page's DOM is only safe when
// the cleanup cannot be skipped.
const ORIGIN_ATTR = 'data-s2md-origin';
const ORIGIN_ROW_ATTR = 'data-s2md-row';
const HEADER_ROW_MARK = 'header';

/**
 * The table's own header row — never one belonging to a table nested inside it.
 * `querySelector` descends, so an outer table with no header "had" one as soon as
 * an inner table did, and the restoration it needed was skipped.
 */
function getTableHeaderRow(table: Element): Element | null {
  for (const child of Array.from(table.children)) {
    if (child.tagName.toLowerCase() !== 'thead') continue;
    const row = Array.from(child.children).find((el) => el.tagName.toLowerCase() === 'tr');
    if (row) return row;
  }
  return null;
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

  const doc = ancestorTable.ownerDocument!;
  const originalHeaderRow = getTableHeaderRow(ancestorTable);

  // Marked before cloning so the clone can be recognised as the header itself
  // rather than merely reading like it.
  originalHeaderRow?.setAttribute(ORIGIN_ROW_ATTR, HEADER_ROW_MARK);
  let selectedRows: Element[];
  try {
    selectedRows = collectFragmentRows(range.cloneContents(), doc);
  } finally {
    originalHeaderRow?.removeAttribute(ORIGIN_ROW_ATTR);
  }
  if (selectedRows.length === 0) return null;

  // "Is the header already selected?" — by identity, not by text. Comparing
  // textContent called it selected whenever a body row happened to repeat the
  // header's words, and that body row was then promoted into the header and lost.
  const headerAlreadySelected = selectedRows.some(
    (row) => row.getAttribute(ORIGIN_ROW_ATTR) === HEADER_ROW_MARK,
  );
  for (const row of selectedRows) row.removeAttribute(ORIGIN_ROW_ATTR);

  if (originalHeaderRow) {
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
  // `textContent` reads a <br> as nothing, and a <pre> that breaks its lines with
  // them — plenty do — collapsed into a single line of code.
  for (const br of Array.from(rawFragment.querySelectorAll('br'))) {
    br.replaceWith(rawFragment.ownerDocument!.createTextNode('\n'));
  }
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
 * Restores the header of every table the fragment carries, not just the one the
 * range happens to sit inside.
 *
 * The dispatcher below can only speak for a range whose common ancestor *is* a
 * semantic element. Drag from the last rows of a table down into the paragraph
 * beneath it and the common ancestor becomes an ordinary `<div>`: no semantic
 * ancestor, no enrichment, and the header — the whole point of the table branch —
 * is silently dropped. That is the common way to select part of a table.
 *
 * Cloned nodes carry no link back to the originals, so the tables are marked
 * before cloning and the marks are removed in a `finally`: touching the page's
 * DOM is only safe if the cleanup cannot be skipped.
 */
function cloneWithTableHeaders(range: Range): DocumentFragment {
  const root = range.commonAncestorContainer;
  const doc = root.ownerDocument ?? (root as Document);
  const scope: ParentNode = (root.nodeType === 1 ? root : root.parentElement) as ParentNode;
  if (!scope?.querySelectorAll) return range.cloneContents();

  const originals = Array.from(scope.querySelectorAll('table'));
  // Marked before cloning, or the clone carries no mark and there is nothing to
  // match it back to.
  originals.forEach((table, index) => table.setAttribute(ORIGIN_ATTR, String(index)));
  try {
    const fragment = range.cloneContents();
    for (const clone of Array.from(fragment.querySelectorAll('table'))) {
      const index = clone.getAttribute(ORIGIN_ATTR);
      clone.removeAttribute(ORIGIN_ATTR);
      if (index === null) continue;
      // A header already in the selection needs nothing; one that was scrolled
      // past does. Its own header — not a nested table's.
      if (getTableHeaderRow(clone)) continue;
      const headerRow = originals[Number(index)] && getTableHeaderRow(originals[Number(index)]!);
      if (!headerRow) continue;

      const thead = doc.createElement('thead');
      thead.appendChild(headerRow.cloneNode(true));
      (thead.firstElementChild as Element | null)?.removeAttribute(ORIGIN_ATTR);
      clone.insertBefore(thead, clone.firstChild);
    }
    return fragment;
  } finally {
    for (const table of originals) table.removeAttribute(ORIGIN_ATTR);
  }
}

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

/**
 * The enrichment a selection gets: the semantic wrapper its range sits in, and —
 * whether or not there was one — the headers of any tables it crosses.
 *
 * Exported because `selectionToMarkdown()` is not the only caller that needs it:
 * the extension's content script builds its own fragment (it has to rewrite
 * newlines into `<br>` first) and so bypassed all of this.
 */
export function enrichRange(range: Range): DocumentFragment {
  return tryEnrichFragment(range) ?? cloneWithTableHeaders(range);
}

export function selectionToMarkdown(selection: Selection, options: MarkItDownOptions = {}): string {
  if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') return '';

  const first = selection.getRangeAt(0);
  // The range's own document, not the global one: the conversion has no reason
  // to need a browser global, and reaching for it put this function out of reach
  // of every test.
  const doc = first.commonAncestorContainer.ownerDocument ?? document;
  const container = doc.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = expandRangeToWordBoundaries(selection.getRangeAt(i));
    const fragment = enrichRange(range);
    container.appendChild(fragment);
  }

  normalizeFragment(container);
  sanitize(container, 'selection', options.math);
  const raw = convertChildren(container, options);
  return normalize(raw);
}
