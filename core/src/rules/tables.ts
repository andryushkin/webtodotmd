import type { Rule, MarkItDownOptions } from '../types.js';
import { convert } from '../core/parser.js';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

interface TableAnalysis {
  level: 'simple' | 'medium' | 'complex';
  hasHead: boolean;
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
  // Header cells get the same treatment as body cells: a list in a <th> used to
  // stay a pipe table while the identical list in a <td> took the fallback.
  const blockSelectors = ['ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table']
    .flatMap((tag) => [`td > ${tag}`, `th > ${tag}`])
    .join(', ');
  const hasBlockContent = !!table.querySelector(blockSelectors);
  const hasHead = !!table.querySelector('thead');

  if (hasColspan || hasRowspan || hasNestedTable || hasPreformatted || hasBlockContent) {
    return { level: 'complex', hasHead };
  }

  return { level: hasHead ? 'simple' : 'medium', hasHead };
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
    // The converter's hard break is a trailing backslash plus a newline. Only a
    // <br> directly in the cell is mapped above; one inside a <span> arrives
    // here, and collapsing just the newline would leave the backslash visible.
    .replace(/\\\n/g, '<br>')
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
// Inside a <td> the converter's Markdown sits next to real markup, so text the
// page wrote must not be able to look like markup: a literal "</td></table>",
// "<sub onclick=…>" or "<!--" would close our elements, add behavior, or comment
// out the rest of the table. Escaping happens at the source — on the text nodes,
// before conversion — rather than on the finished string. Filtering the string
// was tried twice and cannot work: it has no way to tell a tag the converter
// emitted from an identical one that came from the page's prose, and it has to
// re-derive Markdown's own structure (code spans, fences of any length) to know
// where a "tag" is not one.
function escapedTextClone(el: Element): Element {
  const clone = el.cloneNode(true) as Element;

  // Attribute values reach the file through the converter's own syntax — a link
  // target, an image's alt text, a title in quotes — so page text arrives there
  // just as it does in a text node.
  const escapeAttributes = (element: Element): void => {
    for (const attr of Array.from(element.attributes)) {
      element.setAttribute(attr.name, escapeHtmlText(attr.value));
    }
  };

  const walk = (node: Element): void => {
    escapeAttributes(node);
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        child.textContent = escapeHtmlText(child.textContent ?? '');
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      const element = child as Element;
      // A nested table is serialized by serializeStructuralTable, which escapes
      // its own cells; walking into it here would escape them twice.
      if (element.tagName.toLowerCase() === 'table') escapeAttributes(element);
      else walk(element);
    }
  };

  walk(clone);
  return clone;
}

// Two things Markdown inside a <td> cannot carry: the whitespace of a <pre>
// (a fenced block collapses when the cell is rendered as HTML) and the shape of
// a nested table. Both are lifted out of the cell, the rest of the cell goes
// through the converter untouched, and the lifted blocks are put back where they
// were. Nothing about lists, breaks or emphasis is re-implemented here.
function topLevelBlocks(cell: Element): Element[] {
  return Array.from(cell.querySelectorAll('pre, table')).filter((el) => {
    let node = el.parentElement;
    while (node && node !== cell) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'pre' || tag === 'table') return false;
      node = node.parentElement;
    }
    return true;
  });
}

// The placeholder must not occur in the cell's own text: the substitution back
// cannot tell one the page wrote from one we inserted. Candidates grow by a
// character, so the search ends within the length of the input.
function mintPlaceholder(text: string): string {
  let token = '\uE000b\uE000';
  for (let padding = 1; text.includes(token); padding += 1) {
    token = `\uE000b${'\uE001'.repeat(padding)}\uE000`;
  }
  return token;
}

// A blank line ends the HTML block and hands the rest of the table to the
// Markdown parser as prose; a trailing backslash is the converter's hard break,
// which means nothing in HTML. Both become <br>. No fenced block reaches here —
// every <pre> was lifted out first.
function htmlSafeMarkdown(md: string): string {
  return md
    .replace(/\\\n/g, '<br>')
    .replace(/\r?\n[ \t]*(?:\r?\n)+/g, '<br><br>')
    // A cell is one line of HTML, so what is left of the Markdown's line
    // structure — list items, one per line — becomes breaks as well.
    .replace(/\r?\n/g, '<br>')
    .trim()
    .replace(/^(?:<br>)+/, '')
    .replace(/(?:<br>)+$/, '');
}

function serializeCellContent(cell: Element, options: MarkItDownOptions): string {
  const originals = topLevelBlocks(cell);
  const clone = escapedTextClone(cell);
  const lifted = topLevelBlocks(clone);

  // The clone is structurally identical, so the two lists line up index by
  // index. If they ever did not, a block would be rendered from the wrong
  // element; fall back to the converter for the whole cell instead of guessing.
  if (lifted.length !== originals.length) return htmlSafeMarkdown(convert(clone, options));

  const token = mintPlaceholder(cell.textContent ?? '');
  const blocks = originals.map((original) =>
    original.tagName.toLowerCase() === 'pre'
      ? `<pre>${preformattedText(original)}</pre>`
      : serializeStructuralTable(original, options),
  );

  lifted.forEach((el, index) => {
    const placeholder = el.ownerDocument?.createTextNode(`${token}${index}${token}`);
    if (placeholder) el.replaceWith(placeholder);
  });

  const md = htmlSafeMarkdown(convert(clone, options));
  return md.replace(
    new RegExp(`${token}(\\d+)${token}`, 'g'),
    (_match, index: string) => blocks[Number(index)] ?? '',
  );
}

function ownCaption(table: Element): Element | undefined {
  return Array.from(table.children).find((child) => child.tagName.toLowerCase() === 'caption');
}

function serializeStructuralTable(table: Element, options: MarkItDownOptions): string {
  const lines: string[] = ['<table>'];
  const caption = ownCaption(table);
  if (caption) lines.push(`<caption>${serializeCellContent(caption, options)}</caption>`);
  for (const row of ownRows(table)) {
    const cells = ownCells(row)
      .map((cell) => {
        const tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
        const spans = `${spanAttribute(cell, 'colspan')}${spanAttribute(cell, 'rowspan')}`;
        return `<${tag}${spans}>${serializeCellContent(cell, options)}</${tag}>`;
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
      const headRows = analysis.hasHead ? ownRows(el, 'thead tr') : [];

      // Every row that is not a header row is a body row — including <tfoot>,
      // and including rows outside any section. Selecting 'tbody tr' instead
      // dropped a totals row without a word.
      // GFM allows exactly one header row, so any further <thead> row moves into
      // the body rather than disappearing.
      const headerRow = (analysis.hasHead ? headRows[0] : allRows[0]) ?? null;
      if (!headerRow) return '';
      const bodyRowEls = allRows.filter((row) => row !== headerRow);

      const headerCells = ownCells(headerRow);
      const headers = headerCells.map((c) => getCellContent(c, options));
      const alignments = headerCells.map(getAlignment);

      const bodyData = bodyRowEls.map((row) =>
        ownCells(row).map((c) => getCellContent(c, options)),
      );

      if (headers.every((h) => !h) && bodyData.length === 0) return '';

      // A body row may be wider than the header: the table widens rather than
      // dropping the extra cells.
      const columnCount = Math.max(headers.length, ...bodyData.map((row) => row.length));
      while (headers.length < columnCount) headers.push('');
      while (alignments.length < columnCount) alignments.push('none');

      const table = buildGFMTable(headers, bodyData, alignments);
      // GFM has no caption, so it becomes the line above the table — losing it
      // silently is worse than moving it.
      const caption = ownCaption(el);
      const captionText = caption ? getCellContent(caption, options).replace(/<br>/g, ' ').trim() : '';
      return captionText ? `\n\n${captionText}\n\n${table}\n\n` : `\n\n${table}\n\n`;
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
