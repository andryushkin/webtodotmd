import type { MarkItDownOptions } from './types.js';
import { sanitize } from './core/sanitizer.js';
import { convertChildren } from './core/parser.js';
import { normalize } from './core/normalizer.js';
import { normalizeFragment } from './core/fragment.js';
import { collectFootnoteDefs, buildFootnotesSection } from './core/footnotes.js';
import { minHeadingLevel, resolveHeadingOffset } from './utils/headings.js';
import { ROW_ATTR } from './utils/inline-style.js';

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

  sanitize(root, options.mode ?? 'full', options.math);
  const raw = convertChildren(root as Element, resolveHeadingOffset(root, options));
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
// from: a clone carries no such link, and every repair below needs one. Each
// session is paired with a `finally` — touching the page's DOM is only safe when
// the cleanup cannot be skipped.
const ORIGIN_ATTR = 'data-s2md-origin';
const ORIGIN_ROW_ATTR = 'data-s2md-row';
const HEADER_ROW_MARK = 'header';

interface MarkSession {
  /** Marks an element, remembering whatever the page kept under that name. */
  set(el: Element, name: string, value: string): void;
  /** Takes the page's own value off, so it cannot be read back as one of ours. */
  clear(el: Element, name: string): void;
  restore(): void;
}

/**
 * A capture is a read of the page, and has to leave it exactly as it was.
 *
 * The cleanup used to be `removeAttribute`, which is only right while nobody
 * else uses these names. A page carrying its own `data-s2md-origin` had it
 * overwritten by a capture and then deleted — the attribute it read its own
 * layout from, gone because someone copied a paragraph.
 */
function markSession(): MarkSession {
  const undo: Array<() => void> = [];
  const remember = (el: Element, name: string): void => {
    const previous = el.getAttribute(name);
    undo.push(
      previous === null ? () => el.removeAttribute(name) : () => el.setAttribute(name, previous),
    );
  };
  return {
    set(el, name, value) {
      remember(el, name);
      el.setAttribute(name, value);
    },
    clear(el, name) {
      if (el.getAttribute(name) === null) return;
      remember(el, name);
      el.removeAttribute(name);
    },
    restore() {
      for (let index = undo.length - 1; index >= 0; index--) undo[index]!();
    },
  };
}

type RowSection = 'thead' | 'tbody' | 'tfoot';

/** The group a row belongs to; a row outside any group is a body row. */
function rowSection(row: Element): RowSection {
  const tag = row.parentElement?.tagName.toLowerCase();
  return tag === 'thead' || tag === 'tfoot' ? tag : 'tbody';
}

/**
 * Rows in the order the reader sees them, not the order the source lists them:
 * `<tfoot>` is legal before `<tbody>`, and HTML 4 required it. The table rule
 * sorts the same way, and both have to agree — a selection that converts
 * differently from the page it was taken from is the whole bug class here.
 */
function sortRowsAsSeen(rows: Element[]): Element[] {
  const rank = (row: Element): number => {
    const section = rowSection(row);
    return section === 'thead' ? 0 : section === 'tfoot' ? 2 : 1;
  };
  return rows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.row);
}

/** The table's own rows — never those of a table nested inside it. */
function getOwnRows(table: Element): Element[] {
  const rows: Element[] = [];
  for (const child of Array.from(table.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'tr') rows.push(child);
    else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      for (const row of Array.from(child.children)) {
        if (row.tagName.toLowerCase() === 'tr') rows.push(row);
      }
    }
  }
  return sortRowsAsSeen(rows);
}

/**
 * The row a conversion of the whole page prints as this table's header: the
 * first row of `<thead>`, and where there is none — most tables on the web have
 * none — the table's own first row.
 *
 * Requiring `<thead>` meant those tables were never repaired at all: select a
 * row in the middle of one and the fragment's first row was the selected row,
 * which the table rule then printed as the header. The row the reader knew the
 * columns by was not restored, it was replaced.
 *
 * Its own row, never a nested table's: `querySelector` descends, so an outer
 * table "had" a header as soon as an inner one did.
 */
function getTableHeaderRow(table: Element): Element | null {
  return getOwnRows(table)[0] ?? null;
}

/**
 * Marks the header row so its clone can be recognised by identity — comparing
 * `textContent` promoted a body row that repeated the header's words. The mark
 * comes off the table's other rows for the length of the capture: the page may
 * use the attribute itself, and a page value of `header` answered for ours.
 */
function markTableHeader(table: Element, marks: MarkSession): Element | null {
  const rows = getOwnRows(table);
  const header = rows[0] ?? null;
  for (const row of rows) {
    if (row === header) marks.set(row, ORIGIN_ROW_ATTR, HEADER_ROW_MARK);
    else marks.clear(row, ORIGIN_ROW_ATTR);
  }
  return header;
}

function isMarkedHeader(row: Element): boolean {
  return row.getAttribute(ORIGIN_ROW_ATTR) === HEADER_ROW_MARK;
}

/**
 * Собирает <tr> элементы, принадлежащие самой таблице выделения.
 * Случаи:
 *   - commonAncestorContainer = <tbody>  → фрагмент содержит <tr> напрямую
 *   - commonAncestorContainer = <table>  → фрагмент содержит <thead>/<tbody>/<tr>
 *   - commonAncestorContainer = <tr>     → фрагмент содержит <td>/<th>,
 *                                          нужно обернуть в один <tr>
 *
 * A whole `<table>` element inside the fragment is always a nested one — the
 * table the range sits in is cut through, so only its groups and rows are
 * cloned, never the element itself. Its rows are its own: descending into it
 * filed the inner table's data under the outer table's header, and the inner
 * table disappeared. Left alone, the fragment has no rows of its own and the
 * caller falls through to the clone-with-context path, which converts the
 * nested table as the table it is.
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
      } else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
        walk(child);
      }
    }
  }

  walk(fragment);

  // Если <tr> не нашли — возможно, commonAncestor был <tr>,
  // и фрагмент содержит td/th напрямую → оборачиваем в один <tr>.
  // Прямые дети, не querySelectorAll: ячейка вложенной таблицы принадлежит ей,
  // а не строке, которую мы собираем.
  if (rows.length === 0) {
    const cells = Array.from(fragment.childNodes).filter((node): node is Element => {
      if (node.nodeType !== 1) return false;
      const tag = (node as Element).tagName.toLowerCase();
      return tag === 'td' || tag === 'th';
    });
    if (cells.length > 0) {
      const tr = doc.createElement('tr');
      for (const cell of cells) tr.appendChild(cell.cloneNode(true));
      rows.push(tr);
    }
  }

  return sortRowsAsSeen(rows);
}

/**
 * Строит DocumentFragment с таблицей. headerRow может быть null (пустая таблица).
 *
 * Every row went into one new `<tbody>` before, which threw away which group it
 * came from — and with it the reader's order. A `<tfoot>` written above
 * `<tbody>` is legal HTML, and the totals row then arrived above the data the
 * page showed it under.
 */
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

  const groups = new Map<RowSection, Element>();
  for (const row of bodyRows) {
    // A header row that is not *the* header is body content: GFM has one header.
    const section: RowSection = rowSection(row) === 'tfoot' ? 'tfoot' : 'tbody';
    let group = groups.get(section);
    if (!group) {
      group = doc.createElement(section);
      groups.set(section, group);
      table.appendChild(group);
    }
    group.appendChild(row.cloneNode(true));
  }

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
  const marks = markSession();
  let originalHeaderRow: Element | null;
  let selectedRows: Element[];
  try {
    // Marked before cloning so the clone can be recognised as the header itself
    // rather than merely reading like it.
    originalHeaderRow = markTableHeader(ancestorTable, marks);
    selectedRows = collectFragmentRows(range.cloneContents(), doc);
  } finally {
    marks.restore();
  }
  if (selectedRows.length === 0) return null;

  // "Is the header already selected?" — by identity, not by text. Comparing
  // textContent called it selected whenever a body row happened to repeat the
  // header's words, and that body row was then promoted into the header and lost.
  const selectedHeader = selectedRows.find(isMarkedHeader) ?? null;
  for (const row of selectedRows) row.removeAttribute(ORIGIN_ROW_ATTR);

  if (selectedHeader) {
    // Шапка уже есть в выделении — оформляем корректную структуру
    return buildTableFragment(
      selectedHeader,
      selectedRows.filter((row) => row !== selectedHeader),
      doc,
    );
  }
  // Шапка не выделена — добавляем из оригинала
  return buildTableFragment(originalHeaderRow, selectedRows, doc);
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
  // The list itself, not only the item: two items dragged through have the list
  // as their common ancestor, and without it the clone was a run of bare <li>
  // elements — which the list rule, finding no <ol> parent, bulleted.
  'li', 'ul', 'ol',
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
  // Through cloneWithContext, not cloneContents: a quoted table is still a
  // table, and picking the wrapper used to mean giving up on its header.
  const rawFragment = cloneWithContext(range);
  if (!(rawFragment.textContent ?? '').trim()) return null;

  const doc = ancestorBq.ownerDocument!;
  const bq = doc.createElement('blockquote');
  bq.appendChild(rawFragment);

  const frag = doc.createDocumentFragment();
  frag.appendChild(bq);
  return frag;
}

function buildHeadingFragment(range: Range, ancestorH: Element): DocumentFragment | null {
  const rawFragment = cloneWithContext(range);
  if (!(rawFragment.textContent ?? '').trim()) return null;

  const doc = ancestorH.ownerDocument!;
  const heading = doc.createElement(ancestorH.tagName.toLowerCase());
  heading.appendChild(rawFragment);

  const frag = doc.createDocumentFragment();
  frag.appendChild(heading);
  return frag;
}

/** A list's own items — never those of a list nested inside one of them. */
function ownListItems(list: Element): Element[] {
  return Array.from(list.children).filter((el) => el.tagName.toLowerCase() === 'li');
}

/**
 * The number the list rule prints for an item: the list's `start`, advanced by
 * the item's position.
 *
 * Copying `start` onto a fragment that begins further down restarted the count
 * there — the eighth item of `<ol start="7">` came out numbered 7, and a reader
 * comparing the note against the page found the wrong line.
 */
function itemOrdinal(list: Element, index: number): number {
  const start = parseInt(list.getAttribute('start') ?? '1', 10);
  return (Number.isNaN(start) ? 1 : start) + Math.max(index, 0);
}

/**
 * Restores the `<ol>`/`<ul>` around whatever of a list was selected: one item
 * caught by its `<li>` ancestor, or several caught by the list itself.
 */
function buildListFragment(range: Range, ancestor: Element): DocumentFragment | null {
  const doc = ancestor.ownerDocument!;
  const isItem = ancestor.tagName.toLowerCase() === 'li';
  const list = isItem ? ancestor.closest('ul, ol') : ancestor;
  const ordered = list?.tagName.toLowerCase() === 'ol';

  const marks = markSession();
  let content: DocumentFragment;
  try {
    // Which item the selection starts at is only visible on the originals —
    // the clone knows nothing of the items above it.
    if (ordered && !isItem) {
      ownListItems(list!).forEach((item, index) =>
        marks.set(item, ORIGIN_ATTR, String(itemOrdinal(list!, index))),
      );
    }
    content = cloneWithContext(range);
  } finally {
    marks.restore();
  }
  if (!(content.textContent ?? '').trim()) return null;

  let ordinal: number | null = null;
  if (ordered && isItem) {
    ordinal = itemOrdinal(list!, ownListItems(list!).indexOf(ancestor));
  } else if (ordered) {
    const items = Array.from(content.querySelectorAll('li'));
    const first = items.find((item) => item.getAttribute(ORIGIN_ATTR) !== null);
    ordinal = first ? Number(first.getAttribute(ORIGIN_ATTR)) : null;
    for (const item of items) item.removeAttribute(ORIGIN_ATTR);
  }

  const listEl = doc.createElement(list?.tagName.toLowerCase() ?? 'ul');
  if (ordinal !== null && ordinal !== 1) listEl.setAttribute('start', String(ordinal));
  if (isItem) {
    const li = doc.createElement('li');
    li.appendChild(content);
    listEl.appendChild(li);
  } else {
    listEl.appendChild(content);
  }

  const frag = doc.createDocumentFragment();
  frag.appendChild(listEl);
  return frag;
}

const TABLE_TAGS = new Set(['td', 'th', 'tr', 'tbody', 'thead', 'tfoot', 'table']);
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const LIST_TAGS = new Set(['li', 'ul', 'ol']);


/**
 * Restores what every table and every ordered list in the fragment lost by being
 * cut through — not just the one the range happens to sit inside.
 *
 * The dispatcher below can only speak for a range whose common ancestor *is* a
 * semantic element. Drag from the last rows of a table down into the paragraph
 * beneath it and the common ancestor becomes an ordinary `<div>`: no semantic
 * ancestor, no enrichment, and the header — the whole point of the table branch —
 * is silently dropped. That is the common way to select part of a table.
 *
 * Cloned nodes carry no link back to the originals, so they are marked before
 * cloning and the marks are undone in a `finally`: touching the page's DOM is
 * only safe if the cleanup cannot be skipped. Marks are stripped from the clone
 * one owner at a time rather than in a sweep, so that a caller which set marks
 * of its own before calling can still read them afterwards.
 */
function cloneWithContext(range: Range): DocumentFragment {
  const root = range.commonAncestorContainer;
  const doc = root.ownerDocument ?? (root as Document);
  const scope: ParentNode = (root.nodeType === 1 ? root : root.parentElement) as ParentNode;
  if (!scope?.querySelectorAll) return range.cloneContents();

  const originals = Array.from(scope.querySelectorAll('table'));
  const marks = markSession();
  try {
    // Marked before cloning, or the clone carries no mark and there is nothing
    // to match it back to.
    originals.forEach((table, index) => {
      marks.set(table, ORIGIN_ATTR, String(index));
      markTableHeader(table, marks);
    });
    for (const list of Array.from(scope.querySelectorAll('ol'))) {
      ownListItems(list).forEach((item, index) =>
        marks.set(item, ORIGIN_ATTR, String(itemOrdinal(list, index))),
      );
    }

    const fragment = range.cloneContents();

    for (const clone of Array.from(fragment.querySelectorAll('table'))) {
      const index = clone.getAttribute(ORIGIN_ATTR);
      clone.removeAttribute(ORIGIN_ATTR);
      // Its own rows — a nested table's header does not answer for this one.
      const rows = getOwnRows(clone);
      // A header already in the selection needs nothing; one that was scrolled
      // past does.
      const selected = rows.some(isMarkedHeader);
      for (const row of rows) row.removeAttribute(ORIGIN_ROW_ATTR);
      if (index === null || selected) continue;
      const original = originals[Number(index)];
      const headerRow = original ? getTableHeaderRow(original) : null;
      if (!headerRow) continue;

      const thead = doc.createElement('thead');
      thead.appendChild(headerRow.cloneNode(true));
      const restored = thead.firstElementChild as Element | null;
      restored?.removeAttribute(ORIGIN_ATTR);
      restored?.removeAttribute(ORIGIN_ROW_ATTR);
      clone.insertBefore(thead, clone.firstChild);
    }

    // A list cut into keeps `start` from the original, which numbers the items
    // as if the selection had begun at the top of the list.
    for (const clone of Array.from(fragment.querySelectorAll('ol'))) {
      const items = ownListItems(clone);
      const first = items.find((item) => item.getAttribute(ORIGIN_ATTR) !== null);
      if (first) clone.setAttribute('start', first.getAttribute(ORIGIN_ATTR)!);
      for (const item of items) item.removeAttribute(ORIGIN_ATTR);
    }

    return wrapInRow(fragment, scope, doc);
  } finally {
    marks.restore();
  }
}

/**
 * Gives the fragment back the box its content was measured in.
 *
 * `ROW_ATTR` sits on the container, and a drag that starts and ends inside one
 * makes that container the common ancestor — so `cloneContents()` hands back its
 * children and leaves the mark behind. Selecting the whole of a row keeps it and
 * converts correctly; dragging across the sentence *inside* the row is the same
 * content with the evidence gone, and `<span>Wow even</span><div><a>@karpathy</a>
 * </div><span>admits …</span>` came back as three paragraphs — the defect the
 * measurement exists to repair, reappearing on the commoner gesture of the two.
 *
 * A shallow copy rather than a fresh `<div>`: what the mark means is settled
 * beside the rest of the container's own attributes, and inventing a box with
 * one attribute on it would answer a later question differently than the page's
 * box would.
 *
 * `'header'` is refused because the name carries two meanings — a measured row
 * and a marked table header (`ORIGIN_ROW_ATTR`) — and a `<tr>` is not a box
 * anything was measured in.
 */
function wrapInRow(fragment: DocumentFragment, scope: ParentNode, doc: Document): DocumentFragment {
  const el = scope as Element;
  const mark = el.nodeType === 1 ? el.getAttribute?.(ROW_ATTR) : null;
  if (mark === null || mark === undefined || mark === HEADER_ROW_MARK) return fragment;
  const box = el.cloneNode(false) as Element;
  box.appendChild(fragment);
  const wrapped = doc.createDocumentFragment();
  wrapped.appendChild(box);
  return wrapped;
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
  if (LIST_TAGS.has(tag)) return buildListFragment(range, ancestor);
  if (TABLE_TAGS.has(tag)) return tryEnrichTableFragment(range);
  if (tag === 'blockquote') return buildBlockquoteFragment(range, ancestor);

  return null;
}

/**
 * The enrichment a selection gets: the semantic wrapper its range sits in, and —
 * whether or not there was one — the context of everything the fragment carries.
 *
 * The two were alternatives, which this comment already denied. A selection
 * crossing two tables inside a blockquote took the blockquote branch and stopped
 * there: the second table kept the header the selection happened to include, the
 * first one lost its own and, down to a single cell, stopped being a table at
 * all. The wrapper builders clone through `cloneWithContext` now, so choosing a
 * wrapper no longer costs the restoration.
 *
 * Exported because `selectionToMarkdown()` is not the only caller that needs it:
 * the extension's content script builds its own fragment (it has to rewrite
 * newlines into `<br>` first) and so bypassed all of this.
 */
export function enrichRange(range: Range): DocumentFragment {
  return tryEnrichFragment(range) ?? cloneWithContext(range);
}

/**
 * One heading shift for a capture that is several fragments, each converted on
 * its own.
 *
 * `topHeadingLevel` is worked out per call to `toMarkdown`, which is right for a
 * document and wrong for a highlighter run: pick out an `<h2>` and the `<h3>`
 * under it and each fragment would put its own heading at the top level, so two
 * ranks the reader saw come back as one. Asking every fragment first is what
 * keeps the distance between them.
 *
 * The probe is a copy: `sanitize()` edits what it is handed, and these fragments
 * are about to be converted for real. It is also what makes the answer the same
 * one `toMarkdown` would reach alone — a heading hidden from the reader is gone
 * by the time the level is read, on both paths.
 */
export function headingOffsetAcross(nodes: Iterable<Node>, options: MarkItDownOptions = {}): number {
  if (options.topHeadingLevel === undefined) return 0;
  return offsetForTop(topHeadingLevelAcross(nodes, options), options.topHeadingLevel);
}

/**
 * The shallowest heading across several fragments, or `null` where none has one.
 *
 * Separate from the offset because a caller may be collecting an answer that
 * outlives this conversion: a panel that appends one capture to another has to
 * shift the second by what the first was shifted by, and the level is what the
 * two of them share. The offset is then `offsetForTop` over the smaller of the
 * two levels.
 */
export function topHeadingLevelAcross(
  nodes: Iterable<Node>,
  options: MarkItDownOptions = {},
): number | null {
  let min: number | null = null;
  for (const node of nodes) {
    const probe = node.cloneNode(true) as Element;
    sanitize(probe, options.mode ?? 'full', options.math);
    const level = minHeadingLevel(probe as unknown as ParentNode);
    if (level !== null && (min === null || level < min)) min = level;
  }
  return min;
}

/**
 * The shift that raises `top` to `topLevel`, upwards only — the same rule
 * `headingOffsetTo` states, over a level that has already been worked out.
 */
export function offsetForTop(top: number | null, topLevel: number): number {
  return top === null ? 0 : Math.min(0, topLevel - top);
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
  // Not `options.mode`: this function only ever gets a selection, so the answer
  // is not the caller's to give.
  sanitize(container, 'selection', options.math);
  // The same resolution `toMarkdown` does, and for the same reason: it is asked
  // after `sanitize()`, so an `.sr-only` heading nobody saw cannot set the base.
  // This entry point was skipping it, so `topHeadingLevel` was accepted and
  // silently spent on nothing — a selection whose shallowest heading is an `<h4>`
  // came back `####` while the other half of the public surface shifted it.
  const raw = convertChildren(container, resolveHeadingOffset(container, options));
  return normalize(raw);
}
