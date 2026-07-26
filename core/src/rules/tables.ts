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
  // A <pre> at any depth is decisive: a pipe table has nowhere to put its
  // newlines, and collapsing them edits the code. The rest stay direct-child
  // checks — a list or heading in a cell survives as Markdown with <br> breaks,
  // so pulling those into the HTML fallback would cost more than it saves.
  const hasPreformatted = !!table.querySelector('td pre, th pre');
  const hasBlockContent = !!table.querySelector(
    'td > ul, td > ol, td > blockquote, td > h1, td > h2, td > h3, td > h4, td > h5, td > h6, td > table',
  );
  const hasHead = !!table.querySelector('thead');
  const rowEls = ownRows(table);
  const columns = rowEls[0] ? ownCells(rowEls[0]).length : 0;
  const rows = rowEls.length;

  if (hasColspan || hasRowspan || hasNestedTable || hasPreformatted || hasBlockContent) {
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

// The HTML fallback carries what a pipe table has no syntax for: merged cells,
// a nested table, block content in a cell. It emits markup this module builds
// itself — table, tr, td, th, pre and nothing else — rather than passing the
// page's own markup through. Filtering the page's HTML was tried and is the
// wrong shape: every tag not on the deny list survived, so <form>, <video
// autoplay>, inline styles and event-carrying attributes reached the .md file,
// while the rest of the converter reduces all of them to text.
const MAX_SPAN = 1000;

// The converter emits exactly these, with no attributes: `<br>` from a cell's
// line break and `<sub>`/`<sup>` from inline.ts. Everything else that looks like
// a tag is prose from the page — and inside a <td> that prose sits next to real
// markup, where a literal "</td></table>" would close our own elements.
//
// The match must be exact. A tag name alone is not enough: the page can write
// `<sub style=... onclick=...>` as text, and passing it through would put live
// markup in a file that Copy and Download hand over without sanitizing.
const PAIRED_CONVERTER_TAGS = new Set(['sub', 'sup']);

function escapeStrayTags(md: string): string {
  // Closing tags are matched against what is actually open, so a `</sub>` the
  // page wrote as prose cannot close a `<sub>` the converter opened. A bare
  // opening tag is indistinguishable from the converter's own and is left alone:
  // without attributes it carries nothing but formatting.
  const open: string[] = [];
  return md.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (match, slash, rawTag, rest) => {
    const tag = String(rawTag).toLowerCase();
    const escaped = `&lt;${slash}${rawTag}${rest}&gt;`;
    if (rest !== '') return escaped;
    if (!slash && tag === 'br') return match;
    if (!slash && PAIRED_CONVERTER_TAGS.has(tag)) {
      open.push(tag);
      return match;
    }
    if (slash && open[open.length - 1] === tag) {
      open.pop();
      return match;
    }
    return escaped;
  });
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A span is a number or it is not carried at all. 1 is the default, so it adds
// nothing; anything unparseable or absurd is a page's typo, not a layout.
function spanAttribute(cell: Element, name: 'colspan' | 'rowspan'): string {
  const raw = cell.getAttribute(name)?.trim() ?? '';
  // Digits only: Number() would read "1e3" as 1000 and "0x2" as 2, inventing a
  // span the page never wrote.
  if (!/^\d{1,4}$/.test(raw)) return '';
  const value = Number(raw);
  if (value < 2 || value > MAX_SPAN) return '';
  return ` ${name}="${value}"`;
}

// Newlines inside <pre> are content: they become &#10;, which re-parses to the
// same text. A blank line would end the HTML block and hand the rest of the
// table to the Markdown parser as prose.
function preformattedText(el: Element): string {
  return escapeHtmlText(el.textContent ?? '').replace(/\r?\n/g, '&#10;');
}

// A blank line ends the HTML block and hands the rest of the table to the
// Markdown parser as prose, so blank lines have to go — but inside a fenced code
// block every newline is content. A <pre> nested in a wrapper reaches the
// converter as a fence (the wrapper's own Markdown, a list marker for instance,
// is worth keeping), so its newlines are encoded rather than collapsed: &#10;
// re-parses to the same text.
function htmlSafeMarkdown(md: string): string {
  return md
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((part, index) =>
      index % 2 === 1
        ? part.replace(/\r?\n/g, '&#10;')
        : part.replace(/\r?\n[ \t]*(?:\r?\n)+/g, '<br><br>'),
    )
    .join('');
}

// Nodes that get their own markup instead of going through the converter: a
// nested table keeps its structure, and a <pre> keeps its whitespace, which
// Markdown inside a cell cannot. Both are found at any depth — a <pre> wrapped
// in a <div> is still a <pre>, and running it through the converter would turn
// the blank lines in the code into <br><br>.
function serializeNodes(nodes: Node[], options: MarkItDownOptions): string {
  let out = '';
  let pending: Node[] = [];

  const flushMarkdown = (): void => {
    if (pending.length === 0) return;
    let md = '';
    for (const node of pending) {
      if (node.nodeType === TEXT_NODE) md += node.textContent ?? '';
      else if (node.nodeType === ELEMENT_NODE) md += convert(node, options);
    }
    out += htmlSafeMarkdown(escapeStrayTags(md));
    pending = [];
  };

  for (const child of nodes) {
    const el = child.nodeType === ELEMENT_NODE ? (child as Element) : null;
    const tag = el ? el.tagName.toLowerCase() : '';
    if (tag === 'br') {
      // A cell is one line of HTML: the converter's Markdown hard break (a
      // trailing backslash) means nothing here, <br> does.
      flushMarkdown();
      out += '<br>';
    } else if (tag === 'table') {
      flushMarkdown();
      out += serializeStructuralTable(el as Element, options);
    } else if (tag === 'pre') {
      flushMarkdown();
      out += `<pre>${preformattedText(el as Element)}</pre>`;
    } else {
      pending.push(child);
    }
  }
  flushMarkdown();
  // Blank lines around block content became <br><br>; at the cell's edges they
  // are padding from the page's indentation, not content.
  return out.trim().replace(/^(?:<br>)+/, '').replace(/(?:<br>)+$/, '');
}

function serializeStructuralTable(table: Element, options: MarkItDownOptions): string {
  const lines: string[] = ['<table>'];
  for (const row of ownRows(table)) {
    const cells = ownCells(row)
      .map((cell) => {
        const tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
        const spans = `${spanAttribute(cell, 'colspan')}${spanAttribute(cell, 'rowspan')}`;
        return `<${tag}${spans}>${serializeNodes(Array.from(cell.childNodes), options)}</${tag}>`;
      })
      .join('');
    lines.push(`<tr>${cells}</tr>`);
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
        return `\n\n${serializeStructuralTable(el, options)}\n\n`;
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
