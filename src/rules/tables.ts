import type { Rule, MarkItDownOptions } from '../types.js';
import { convert } from '../core/parser.js';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

interface TableAnalysis {
  level: 'simple' | 'medium' | 'complex';
  hasHead: boolean;
  columns: number;
  rows: number;
}

function closestTag(el: Element, tag: string): Element | null {
  let node = el.parentElement;
  while (node) {
    if (node.tagName.toLowerCase() === tag) return node;
    node = node.parentElement;
  }
  return null;
}

// querySelectorAll('tr') descends into nested tables, so an outer table used to
// serialize the inner table's rows as if they were its own — the inner text came
// out once per row plus once inside the cell that contains it. Every row and
// cell lookup goes through these two, which keep to the current level.
function ownRows(table: Element, scope = 'tr'): Element[] {
  return Array.from(table.querySelectorAll(scope)).filter((row) => closestTag(row, 'table') === table);
}

function ownCells(row: Element): Element[] {
  return Array.from(row.querySelectorAll('td, th')).filter((cell) => closestTag(cell, 'tr') === row);
}

function analyzeTable(table: Element): TableAnalysis {
  const hasColspan = !!table.querySelector('[colspan]');
  const hasRowspan = !!table.querySelector('[rowspan]');
  const hasNestedTable = !!table.querySelector('table table');
  const hasBlockContent = !!table.querySelector(
    'td > ul, td > ol, td > pre, td > blockquote, td > h1, td > h2, td > h3, td > h4, td > h5, td > h6, td > table',
  );
  const hasHead = !!table.querySelector('thead');
  const rowEls = ownRows(table);
  const columns = rowEls[0] ? ownCells(rowEls[0]).length : 0;
  const rows = rowEls.length;

  if (hasColspan || hasRowspan || hasNestedTable || hasBlockContent) {
    return { level: 'complex', hasHead, columns, rows };
  }

  if (!hasHead) {
    return { level: 'medium', hasHead, columns, rows };
  }

  return { level: 'simple', hasHead, columns, rows };
}

function getCellContent(cell: Element, options: MarkItDownOptions): string {
  let text = '';
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      if (el.tagName.toLowerCase() === 'br') {
        text += '<br>';
      } else {
        text += convert(child, options);
      }
    } else if (child.nodeType === TEXT_NODE) {
      text += child.textContent ?? '';
    }
  }
  // A GFM row is one line: a newline anywhere inside a cell ends the row early
  // and the rest of the table falls apart. Block children (two paragraphs in a
  // cell, say) produce exactly that, so line breaks become <br>, the only break
  // a pipe table can carry.
  return text
    .trim()
    .replace(/\|/g, '\\|')
    .replace(/\s*\n+\s*/g, '<br>');
}

function getAlignment(cell: Element): string {
  const style = cell.getAttribute('style') ?? '';
  if (/text-align\s*:\s*center/i.test(style)) return ':center:';
  if (/text-align\s*:\s*right/i.test(style)) return ':right:';
  if (/text-align\s*:\s*left/i.test(style)) return ':left:';
  return 'none';
}

function buildSeparator(width: number, alignment: string): string {
  const w = Math.max(width, 3);
  if (alignment === ':center:') return ':' + '-'.repeat(Math.max(w - 2, 1)) + ':';
  if (alignment === ':right:') return '-'.repeat(Math.max(w - 1, 2)) + ':';
  if (alignment === ':left:') return ':' + '-'.repeat(Math.max(w - 1, 2));
  return '-'.repeat(w);
}

function buildGFMTable(headers: string[], bodyRows: string[][], alignments: string[]): string {
  const colWidths = headers.map((h, i) => {
    const maxBody = bodyRows.reduce((max, row) => Math.max(max, (row[i] ?? '').length), 0);
    return Math.max(h.length, maxBody, 3);
  });

  const padCell = (content: string, width: number) => content.padEnd(width);

  const headerLine = '| ' + headers.map((h, i) => padCell(h, colWidths[i] ?? 3)).join(' | ') + ' |';

  const separatorLine =
    '| ' +
    headers.map((_, i) => buildSeparator(colWidths[i] ?? 3, alignments[i] ?? 'none')).join(' | ') +
    ' |';

  const bodyLines = bodyRows.map(
    (row) =>
      '| ' + headers.map((_, i) => padCell(row[i] ?? '', colWidths[i] ?? 3)).join(' | ') + ' |',
  );

  return [headerLine, separatorLine, ...bodyLines].join('\n');
}

const UNSAFE_CELL_TAGS = 'script, style, noscript, iframe, object, embed';

// A blank line anywhere in the serialized cell ends the HTML block and hands the
// rest of the table to the Markdown parser as text — including a blank line
// inside an attribute value, which Markdown cannot see is inside a tag. Deleting
// those newlines would be data loss: they are content inside <pre> and inside
// attributes. So they are carried through serialization as this token and come
// out as &#10;, which re-parses to the same text. The private-use characters
// make a collision with page content effectively impossible.
const NEWLINE_TOKEN = 'htmltodotmd:nl';

function isPreformatted(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    const tag = node.tagName?.toLowerCase();
    if (tag === 'pre' || tag === 'textarea') return true;
    node = node.parentElement;
  }
  return false;
}

function protectNewlines(root: Element): void {
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (/\r?\n/.test(attr.value)) {
        el.setAttribute(attr.name, attr.value.replace(/\r?\n/g, NEWLINE_TOKEN));
      }
    }
  }

  const walk = (parent: Element): void => {
    const preformatted = isPreformatted(parent);
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        const text = child.textContent ?? '';
        // Outside <pre> a blank line is formatting, not content: collapse it.
        // Inside, every newline is data and gets encoded instead.
        child.textContent = preformatted
          ? text.replace(/\r?\n/g, NEWLINE_TOKEN)
          : text.replace(/\r?\n[ \t]*(?:\r?\n)+/g, '\n');
      } else if (child.nodeType === ELEMENT_NODE) {
        walk(child as Element);
      }
    }
  };
  walk(root);
}

// The fallback claims to keep what a pipe table cannot express, so it has to
// keep the markup: textContent turned a list in a cell into "ab", losing both
// the structure and the separation between items. Scripts and event handlers do
// not survive the trip — nothing here should carry behavior into a .md file.
//
// Serialization goes through the DOM rather than string concatenation. An
// attribute value can hold a quote — a page writes it as &quot; and the parser
// hands it back decoded — so building `name="value"` by hand lets that value
// close its own attribute and inject live markup into the file. outerHTML
// re-escapes it.
function serializeCell(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  for (const el of Array.from(clone.querySelectorAll(UNSAFE_CELL_TAGS))) el.remove();
  for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
    }
  }
  protectNewlines(clone);
  return clone.outerHTML.split(NEWLINE_TOKEN).join('&#10;');
}

function serializeComplexTable(table: Element): string {
  const lines: string[] = ['<table>'];
  for (const row of ownRows(table)) {
    lines.push(`<tr>${ownCells(row).map(serializeCell).join('')}</tr>`);
  }
  lines.push('</table>');
  return lines.join('\n');
}

export const TABLE_RULES: Rule[] = [
  {
    name: 'table',
    filter: 'table',
    replacement(el, _childContent, options) {
      const analysis = analyzeTable(el);

      if (analysis.level === 'complex') {
        const fallback = options.complexTableFallback ?? 'html';
        if (fallback === 'skip') return '';
        if (fallback === 'text') {
          const text = ownRows(el)
            .map((row) => ownCells(row).map((c) => c.textContent?.trim() ?? '').join(' | '))
            .join('\n');
          return `\n\n${text}\n\n`;
        }
        // 'html' fallback (default)
        return `\n\n${serializeComplexTable(el)}\n\n`;
      }

      // Simple or medium: build GFM pipe table
      const allRows = ownRows(el);

      let headerRow: Element | null = null;
      let bodyRowEls: Element[] = [];

      if (analysis.hasHead) {
        headerRow = ownRows(el, 'thead tr')[0] ?? null;
        bodyRowEls = ownRows(el, 'tbody tr');
      } else {
        headerRow = allRows[0] ?? null;
        bodyRowEls = allRows.slice(1);
      }

      if (!headerRow) return '';

      const headerCells = ownCells(headerRow);
      const headers = headerCells.map((c) => getCellContent(c, options));
      const alignments = headerCells.map(getAlignment);

      const bodyData = bodyRowEls.map((row) =>
        ownCells(row).map((c) => getCellContent(c, options)),
      );

      if (headers.every((h) => !h) && bodyData.length === 0) return '';

      return `\n\n${buildGFMTable(headers, bodyData, alignments)}\n\n`;
    },
  },
  {
    name: 'table-structural',
    filter: ['thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption'],
    replacement(_el, childContent) {
      return childContent;
    },
  },
];
