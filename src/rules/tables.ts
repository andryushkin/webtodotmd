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

// The fallback claims to keep what a pipe table cannot express, so it has to
// keep the markup: textContent turned a list in a cell into "ab", losing both
// the structure and the separation between items. Scripts and event handlers do
// not survive the trip — nothing here should carry behavior into a .md file.
function cellInnerHTML(cell: Element): string {
  const clone = cell.cloneNode(true) as Element;
  for (const el of Array.from(clone.querySelectorAll(UNSAFE_CELL_TAGS))) el.remove();
  for (const el of [clone, ...Array.from(clone.querySelectorAll('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
    }
  }
  return clone.innerHTML.trim();
}

function serializeComplexTable(table: Element): string {
  const lines: string[] = ['<table>'];
  for (const row of ownRows(table)) {
    const cellsHTML = ownCells(row)
      .map((cell) => {
        const tag = cell.tagName.toLowerCase();
        const attrs = Array.from(cell.attributes)
          .filter((a) => !a.name.toLowerCase().startsWith('on'))
          .map((a) => ` ${a.name}="${a.value}"`)
          .join('');
        return `<${tag}${attrs}>${cellInnerHTML(cell)}</${tag}>`;
      })
      .join('');
    lines.push(`<tr>${cellsHTML}</tr>`);
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
