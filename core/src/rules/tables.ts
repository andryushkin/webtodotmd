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
function fenceMarker(line: string): string | undefined {
  return line.trim().match(/^(`{3,}|~{3,})/)?.[1];
}

function htmlSafeMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);

  // Which lines belong to a fenced block. Length matters: code.ts deliberately
  // emits four or more backticks when the code itself contains three, so pairing
  // by a fixed ``` would cut such a block open at its own content.
  const fenced: boolean[] = [];
  let open: string | undefined;
  for (const line of lines) {
    const marker = fenceMarker(line);
    if (open === undefined) {
      fenced.push(marker !== undefined);
      if (marker !== undefined) open = marker;
      continue;
    }
    fenced.push(true);
    if (marker !== undefined && marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) {
      open = undefined;
    }
  }

  let out = '';
  let blankRun = false;
  let previousFenced = false;
  for (const [index, line] of lines.entries()) {
    const insideFence = fenced[index] ?? false;
    if (!insideFence && line.trim() === '') {
      // A blank line ends the HTML block and hands the rest of the table to the
      // Markdown parser as prose. Outside a fence it is formatting, so it turns
      // into a break; inside, it is content and is kept as &#10;.
      blankRun = true;
      continue;
    }
    if (out !== '') {
      if (blankRun) out += '<br><br>';
      else out += insideFence && previousFenced ? '&#10;' : '\n';
    }
    out += line;
    blankRun = false;
    previousFenced = insideFence;
  }
  return out;
}

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

function serializeWrapper(el: Element, options: MarkItDownOptions): string {
  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.childNodes);

  if (tag === 'ul' || tag === 'ol') {
    const items = children.filter(
      (node) => node.nodeType === ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'li',
    ) as Element[];
    return items
      .map((li, index) => {
        const marker = tag === 'ol' ? `${index + 1}. ` : '- ';
        return `${marker}${serializeNodes(Array.from(li.childNodes), options)}`;
      })
      .join('<br>');
  }

  if (tag === 'blockquote') return `> ${serializeNodes(children, options)}`;

  return serializeNodes(children, options);
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
      if (node.nodeType === TEXT_NODE) md += escapeHtmlText(node.textContent ?? '');
      else if (node.nodeType === ELEMENT_NODE) md += convert(escapedTextClone(node as Element), options);
    }
    out += htmlSafeMarkdown(md);
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
    } else if (el && el.querySelector('pre, table')) {
      // A <pre> only keeps its whitespace as a real <pre>: as a fenced block
      // inside a <td> the renderer collapses it. So descend to reach it — and
      // emit the wrapper's own marker, which the converter would have produced.
      flushMarkdown();
      out += serializeWrapper(el, options);
    } else {
      pending.push(child);
    }
  }
  flushMarkdown();
  // Blank lines around block content became <br><br>; at the cell's edges they
  // are padding from the page's indentation, not content.
  return out.trim().replace(/^(?:<br>)+/, '').replace(/(?:<br>)+$/, '');
}

function ownCaption(table: Element): Element | undefined {
  return Array.from(table.children).find((child) => child.tagName.toLowerCase() === 'caption');
}

function serializeStructuralTable(table: Element, options: MarkItDownOptions): string {
  const lines: string[] = ['<table>'];
  const caption = ownCaption(table);
  if (caption) lines.push(`<caption>${serializeNodes(Array.from(caption.childNodes), options)}</caption>`);
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
      const headRows = analysis.hasHead ? ownRows(el, 'thead tr') : [];

      // Every row that is not a header row is a body row — including <tfoot>,
      // and including rows outside any section. Selecting 'tbody tr' instead
      // dropped a totals row without a word.
      const headerRow = (analysis.hasHead ? headRows[0] : allRows[0]) ?? null;
      if (!headerRow) return '';
      const bodyRowEls = allRows.filter((row) => row !== headerRow && !headRows.includes(row));

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
