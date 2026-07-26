import type { Rule, MarkItDownOptions } from '../types.js';
import { convert } from '../core/parser.js';
import { FALLBACK_ATTR_PATTERN } from '../fallback-tags.js';
import {
  escapeBlockStarts,
  escapeHtmlSyntax,
  escapeInlineMarkdown,
  escapeTagStarts,
} from '../core/escape.js';

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
  const rows = Array.from(table.querySelectorAll(scope)).filter(
    (row) => closestTag(row, 'table') === table,
  );
  // <tfoot> may be written before <tbody> — legal HTML, and HTML 4 required it.
  // Document order would then put a totals row above the data, or make it the
  // header when there is no <thead>.
  const rank = (row: Element): number => {
    const section = row.parentElement?.tagName.toLowerCase();
    if (section === 'thead') return 0;
    if (section === 'tfoot') return 2;
    return 1;
  };
  return rows
    .map((row, index) => ({ row, index, rank: rank(row) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.row);
}

function ownCells(row: Element): Element[] {
  return Array.from(row.querySelectorAll('td, th')).filter((cell) => closestTag(cell, 'tr') === row);
}

function analyzeTable(table: Element): TableAnalysis {
  // What the shape *is*; what to do about it is the rule's decision, and by
  // default it is to flatten rather than to emit HTML.
  const hasMergedCells = Array.from(
    table.querySelectorAll('td[colspan], th[colspan], td[rowspan], th[rowspan]'),
  ).some((cell) => cellSpans(cell, cell.parentElement, table) !== '');
  const hasNestedTable = !!table.querySelector('table table');
  // A <pre> at any depth is decisive: a pipe table has nowhere to put its
  // newlines, and collapsing them edits the code. The rest stay direct-child
  // checks — a list or heading in a cell survives as Markdown with <br> breaks,
  // so pulling those into the HTML fallback would cost more than it saves.
  // Only two kinds of content actually need the HTML form: preformatted text,
  // whose whitespace a pipe cell cannot hold, and a nested table, whose shape it
  // cannot hold. Lists, headings and quotes come out as the same <br>-joined
  // Markdown either way, so forcing the fallback for them only made the format
  // depend on whether a <div> happened to wrap the list.
  const hasPreformatted =
    !!table.querySelector('td pre, th pre') ||
    Array.from(table.querySelectorAll('td code, th code')).some((el) =>
      (el.textContent ?? '').includes('\n'),
    );
  const hasHead = !!table.querySelector('thead');

  if (hasMergedCells || hasNestedTable || hasPreformatted) {
    return { level: 'complex', hasHead };
  }

  return { level: hasHead ? 'simple' : 'medium', hasHead };
}

/**
 * `|` ends a column and is escaped everywhere in a cell, formulas included.
 *
 * Sparing `$…$` was tried and was worse: GFM splits a row into columns before
 * anything looks at maths, so `| $|x| < 2$ | ok |` reparsed as two cells reading
 * `$` and `x` — the formula and the neighbouring cell both vanished. Escaping
 * costs the formula instead (`\|` is `\Vert`, the norm, not an absolute value),
 * and a damaged formula is a smaller loss than a destroyed row. A cell holding a
 * `|` inside maths has no faithful pipe-table form at all; `htmlTables` does.
 */
function escapeCellPipes(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/**
 * What the converter applies to any text node it emits: the page's own
 * characters, made to render as themselves. Named because two places need the
 * same answer — the text node of a cell the converter walks, and the flattened
 * cell of the `text` fallback, which never reaches the converter at all.
 *
 * Block starts are not here, and deliberately: they depend on standing at the
 * beginning of a line, which a text node — or a cell — is not. Whoever builds
 * the line escapes them.
 */
function escapeCellText(text: string): string {
  return escapeHtmlSyntax(escapeInlineMarkdown(text));
}

// A cell is one line, whichever form the table takes. The converter's hard break
// is a trailing backslash plus a newline — a <br> directly in the cell is mapped
// before conversion, but one inside an inline wrapper (<em>, <strong>, a <span>
// the sanitizer kept) arrives as that pair, and dropping only the newline would
// leave the backslash visible.
function breaksToBr(md: string): string {
  return md.replace(/\\\r?\n/g, '<br>').replace(/\s*\r?\n+\s*/g, '<br>');
}

/**
 * The text of a preformatted block, with its lines still in it.
 *
 * `textContent` reads a `<br>` as nothing, so `a<br>b` — how plenty of pages
 * write a code sample, and what anything that pasted HTML into one produces —
 * arrived as `ab` and the reader lost the line. Both table fallbacks read a
 * `<pre>` this way, so both lost it.
 *
 * Deliberately a copy of `textWithLineBreaks` in `rules/code.ts` rather than an
 * import: that rule owns the fenced block and this module owns the cell, and a
 * two-line helper is a smaller thing to keep in step than a dependency between
 * two rule files. Read from a clone either way — the page's own DOM must come
 * back unchanged, and here the element handed over is the page's, not a clone.
 */
function preformattedLines(el: Element): string {
  if (!el.querySelector('br')) return el.textContent ?? '';
  const clone = el.cloneNode(true) as Element;
  for (const br of Array.from(clone.querySelectorAll('br'))) {
    br.replaceWith(clone.ownerDocument!.createTextNode('\n'));
  }
  return clone.textContent ?? '';
}

/**
 * Preformatted text folded into one pipe cell: every line keeps its own code span
 * and its own indentation, and the lines are joined with the only break a pipe
 * cell can carry. A single span across the whole thing would lose the newlines —
 * a code span renders them as spaces — and a fence cannot live in a cell at all.
 */
function preInCell(pre: Element): string {
  const text = preformattedLines(pre).replace(/\n$/, '');
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return '';
      // Leading whitespace is the shape of the code; a code span keeps it only if
      // it is not the very first character, which a non-breaking space fixes.
      const indented = line.replace(/^ +/, (spaces) => '\u00a0'.repeat(spaces.length));
      // The fence must outrun the longest backtick run inside, exactly as a
      // fenced block does. Choosing `` because the line merely contains a
      // backtick closed the span early on ``a `` b``, and everything after it —
      // page text — was read as markup.
      const longest = Math.max(0, ...Array.from(indented.matchAll(/`+/g), (m) => m[0].length));
      const fence = '`'.repeat(longest + 1);
      // A span whose content touches a backtick needs the padding spaces, which
      // a reader never sees; CommonMark strips one from each end.
      const padding = longest > 0 ? ' ' : '';
      // No pipe escaping here: getCellContent escapes the finished cell, and
      // doing it twice produced `\\|`, a literal backslash followed by a column
      // separator — the row split and a cell was lost.
      return `${fence}${padding}${indented}${padding}${fence}`;
    })
    .join('<br>');
}

/**
 * A nested table folded into its cell: the rows it held, one per line, cells
 * separated by a middle dot. A pipe table cannot nest, and the alternative — the
 * inner table's own pipe syntax, separator row and all — arrives as noise.
 */
function nestedTableInCell(table: Element, options: MarkItDownOptions): string {
  return ownRows(table)
    .map((row) =>
      ownCells(row)
        // `escapePipes: false`: the outer getCellContent escapes the finished
        // cell, and escaping the inner cells first turned every `|` into `\\|`.
        .map((cell) => getCellContent(cell, options, false))
        .filter((cell) => cell !== '')
        .join(' · '),
    )
    .filter((row) => row !== '')
    .join('<br>');
}

function getCellContent(
  cell: Element,
  options: MarkItDownOptions,
  escapePipes = true,
): string {
  let text = '';
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element;
      const childTag = el.tagName.toLowerCase();
      if (childTag === 'br') {
        text += '<br>';
      } else if (childTag === 'pre') {
        text += preInCell(el);
      } else if (childTag === 'table') {
        text += nestedTableInCell(el, options);
      } else {
        text += convert(child, options);
      }
    } else if (child.nodeType === TEXT_NODE) {
      // Straight from textContent, so convert()'s escaping never saw it: a cell
      // reading `**bold**` on the page rendered as bold, and one reading
      // `<img src=x onerror=…>` put working markup in the file.
      text += escapeCellText(child.textContent ?? '');
    }
  }
  // A GFM row is one line: a newline anywhere inside a cell ends the row early
  // and the rest of the table falls apart. Block children (two paragraphs in a
  // cell, say) produce exactly that, so line breaks become <br>, the only break
  // a pipe table can carry.
  return breaksToBr(escapePipes ? escapeCellPipes(text.trim()) : text.trim());
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
// Per the HTML Standard: colspan is 1..1000, rowspan is 0..65534, and rowspan="0"
// means "to the end of the row group" — a real merge, not a typo.
const MAX_COLSPAN = 1000;
const MAX_ROWSPAN = 65534;

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// An attribute value is re-emitted by the converter inside Markdown or LaTeX
// syntax — a link target, an image's alt, a math annotation — not as HTML. There
// `&amp;` is corruption rather than safety: a URL gained "&amp;amp;" and a formula
// lost its meaning. Only the characters that could close our own element go.
function escapeAttributeValue(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A span is a number or it is not carried at all. 1 is the default, so it adds
// nothing; anything unparseable or absurd is a page's typo, not a layout.
function spanAttribute(cell: Element, name: 'colspan' | 'rowspan'): string {
  const raw = cell.getAttribute(name)?.trim() ?? '';
  // Digits only: Number() would read "1e3" as 1000 and "0x2" as 2, inventing a
  // span the page never wrote. The emitted form has to satisfy
  // FALLBACK_ATTR_PATTERN, which is what consumers match against.
  if (!/^\d{1,5}$/.test(raw)) return '';
  const value = Number(raw);
  // 1 is the default and adds nothing. Zero is meaningful for rowspan only.
  if (name === 'colspan') {
    if (value < 2 || value > MAX_COLSPAN) return '';
  } else if (value === 1 || value > MAX_ROWSPAN) {
    return '';
  }
  const emitted = ` ${name}="${value}"`;
  // Cheap self-check on the contract the preview escaper matches against.
  return FALLBACK_ATTR_PATTERN.test(emitted) ? emitted : '';
}

// Newlines inside <pre> are content: they become &#10;, which re-parses to the
// same text. A blank line would end the HTML block and hand the rest of the
// table to the Markdown parser as prose.
function preformattedText(el: Element): string {
  return escapeHtmlText(preformattedLines(el)).replace(/\r?\n/g, '&#10;');
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
// Elements whose text the converter re-emits as LaTeX rather than HTML: escaping
// inside them turns `a & b` into `a &amp; b` and breaks the formula. The
// selectors mirror the math rules' own filters.
function isMathSubtree(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return (
    tag === 'math' ||
    tag === 'mjx-container' ||
    tag === 'annotation' ||
    // MathJax v2 keeps the LaTeX in a <script type="math/tex">, which the
    // sanitizer spares only when math is on. Without it named here the walk below
    // treated the formula as prose: `a & b_1` — a matrix separator and a
    // subscript — came back as `$a &amp; b_1$` and the reader saw `&amp;`.
    (tag === 'script' && (el.getAttribute('type') ?? '').startsWith('math/tex')) ||
    el.classList?.contains('katex') === true
  );
}

/**
 * A `<` still open when the node ends. `escapeTagStarts` judges a `<` by the
 * character after it, and at the end of a node that character belongs to the next
 * node — which is joined on afterwards, when nothing is looking.
 */
function escapeDanglingTagStart(text: string): string {
  return text.replace(/<$/, '&lt;');
}

function escapeMathText(root: Element): void {
  // The parser splits text at every boundary, so `<` can sit in a node of its own
  // where a lookahead cannot see what follows. The math rules read a container's
  // whole textContent, so escape it as one string and let the assignment collapse
  // the nodes.
  const containers = [root, ...Array.from(root.querySelectorAll('annotation, script'))];
  for (const el of containers) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'annotation' || tag === 'script') {
      el.textContent = escapeTagStarts(el.textContent ?? '');
    }
    // Wikipedia carries the formula in an attribute, where the general attribute
    // escaping would replace every `<` and break the LaTeX.
    const alttext = el.getAttribute('alttext');
    if (alttext !== null) el.setAttribute('alttext', escapeTagStarts(alttext));
  }
  escapeMathElementText(root);
}

/**
 * MathML that carries no LaTeX of its own, where the formula *is* the elements:
 * `<mo>&lt;</mo><mi>img src=x onerror=…&gt;</mi>` is how a page writes that text,
 * and this cell is an HTML block, so the two nodes joined into a working tag.
 *
 * Collapsing the subtree into one string — what the containers above do — is not
 * available here: the elements are the notation, and the rule that turns raw
 * MathML into LaTeX reads the subtree's markup. So each text node is escaped on
 * its own, and a `<` left dangling at its end is neutralized on suspicion, which
 * is the only thing a per-node rule can do about a seam it cannot see across.
 * `&lt;` and not a backslash, for the same reason as everywhere in this file: the
 * cell is HTML, where an entity is what renders as the character.
 */
function escapeMathElementText(el: Element): void {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      child.textContent = escapeDanglingTagStart(escapeTagStarts(child.textContent ?? ''));
    } else if (child.nodeType === ELEMENT_NODE) {
      escapeMathElementText(child as Element);
    }
  }
}

function escapedTextClone(el: Element): Element {
  const clone = el.cloneNode(true) as Element;

  // Attribute values reach the file through the converter's own syntax — a link
  // target, an image's alt text, a title in quotes — so page text arrives there
  // just as it does in a text node.
  const escapeAttributes = (element: Element): void => {
    for (const attr of Array.from(element.attributes)) {
      element.setAttribute(attr.name, escapeAttributeValue(attr.value));
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
      // its own cells; walking into it here would escape them twice. A math
      // subtree becomes LaTeX, where escaping is corruption.
      if (element.tagName.toLowerCase() === 'table') {
        escapeAttributes(element);
      } else if (isMathSubtree(element)) {
        // LaTeX keeps its `&` and a `<` that is not a tag start; only what could
        // close this cell is neutralized. The general attribute escaping would
        // replace every `<`, so it is skipped here.
        escapeMathText(element);
      } else {
        walk(element);
      }
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
// A subset of FALLBACK_TAGS: the elements lifted out of a cell rather than
// converted, because Markdown in a cell cannot carry their whitespace or shape.
const LIFTED_TAGS = ['pre', 'table', 'code'];
const LIFTED_SELECTOR = LIFTED_TAGS.join(', ');

function topLevelBlocks(cell: Element): Element[] {
  return Array.from(cell.querySelectorAll(LIFTED_SELECTOR)).filter((el) => {
    let node = el.parentElement;
    while (node && node !== cell) {
      if (LIFTED_TAGS.includes(node.tagName.toLowerCase())) return false;
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
  // Nothing to lift: skip minting a token from the cell's outerHTML, pairing the
  // clone, and scanning the result — a large table is mostly plain cells.
  const cellOptions = { ...options, outputContext: 'html' as const };
  if (originals.length === 0) return htmlSafeMarkdown(convert(clone, cellOptions));
  // A deep clone with rewritten text and attributes has the same elements in the
  // same order, so the two lists line up index by index.
  const lifted = topLevelBlocks(clone);

  // outerHTML, not textContent: href, src, alt and title reach the output too, so
  // a placeholder written into one of them would be substituted as well.
  const token = mintPlaceholder(cell.outerHTML);
  const blocks = originals.map((original) => {
    const tag = original.tagName.toLowerCase();
    if (tag === 'table') return serializeStructuralTable(original, options);
    // Both keep their text verbatim, newlines included: a blank line would end
    // the HTML block and hand the rest of the table to the Markdown parser. A
    // code span would also have to be escaped to keep a literal "</td>" from
    // closing the cell, and Markdown does not decode entities inside one — the
    // reader would see &lt;/td&gt;. As an element it stays safe and legible.
    return `<${tag}>${preformattedText(original)}</${tag}>`;
  });

  lifted.forEach((el, index) => {
    const placeholder = el.ownerDocument?.createTextNode(`${token}${index}${token}`);
    if (placeholder) el.replaceWith(placeholder);
  });

  const md = htmlSafeMarkdown(convert(clone, cellOptions));
  return md.replace(
    new RegExp(`${token}(\\d+)${token}`, 'g'),
    (_match, index: string) => blocks[Number(index)] ?? '',
  );
}

function ownCaption(table: Element): Element | undefined {
  return Array.from(table.children).find((child) => child.tagName.toLowerCase() === 'caption');
}

// GFM has no caption, so it becomes the line above the table. Whenever a table
// produces no rows the caption is all that is left, and dropping it is exactly
// the silent loss this module avoids elsewhere.
function captionLine(table: Element, options: MarkItDownOptions): string {
  const caption = ownCaption(table);
  if (!caption) return '';
  // getCellContent escapes the inline marks of every text node but not the
  // block starts — inside a pipe cell nothing opens a block, so escaping them
  // there would be backslashes for nothing. Here the caption *is* a line of the
  // document, standing on its own above the table, so a caption reading
  // "# Table 1" or "- totals" opened a heading or a list the page never had.
  // The whole line is escaped, not its first text node: everything blockish in
  // the caption has already been folded onto this one line, so nothing on it is
  // still a block that escaping could cost.
  return escapeBlockStarts(getCellContent(caption, options).replace(/<br>/g, ' ').trim());
}

function captionOnly(table: Element, options: MarkItDownOptions): string {
  const text = captionLine(table, options);
  return text ? `\n\n${text}\n\n` : '';
}

// rowspan="0" spans to the end of the cell's row group. The emitted table has no
// <thead>/<tbody>/<tfoot>, so that group would become the whole table and the
// cell would cover rows it never covered on the page — the more so because rows
// are re-ordered by section. Resolve it to a count instead.
function resolvedRowspan(cell: Element, row: Element, table: Element): string {
  const attr = spanAttribute(cell, 'rowspan');
  if (attr !== ' rowspan="0"') return attr;
  const groupRows = ownRows(table).filter((candidate) => candidate.parentElement === row.parentElement);
  const remaining = groupRows.length - groupRows.indexOf(row);
  return remaining > 1 ? ` rowspan="${remaining}"` : '';
}

/** The number inside ` colspan="3"`, or 1 when the attribute did not survive. */
function spanCount(attribute: string): number {
  const value = /="(\d+)"/.exec(attribute);
  return value ? Number(value[1]) : 1;
}

/**
 * The table as a grid of positions, with merged cells expanded.
 *
 * A pipe table has no syntax for a merge, so the cell is placed where it starts
 * and every further position it covered is left empty — `<td colspan="2">120</td>`
 * becomes `| 120 |  |`. Walking positions rather than cells is what keeps the
 * columns lined up: a `rowspan` consumes a position in later rows too, and
 * without accounting for it every row below a merge shifted left.
 */
function expandSpans(rows: Element[], table: Element): (Element | null)[][] {
  const grid: (Element | null)[][] = rows.map(() => []);
  const taken: Set<number>[] = rows.map(() => new Set());

  rows.forEach((row, r) => {
    let column = 0;
    for (const cell of ownCells(row)) {
      while (taken[r]!.has(column)) column += 1;
      const across = spanCount(spanAttribute(cell, 'colspan'));
      const down = spanCount(resolvedRowspan(cell, row, table));

      for (let dr = 0; dr < down && r + dr < rows.length; dr += 1) {
        // A rowspan stops at its row group: a browser does not let a <tbody>
        // cell reach into <tfoot>, and following it there put the totals row's
        // values one column to the right, under the wrong header.
        if (rows[r + dr]!.parentElement !== row.parentElement) break;
        for (let dc = 0; dc < across; dc += 1) {
          taken[r + dr]!.add(column + dc);
          grid[r + dr]![column + dc] = dr === 0 && dc === 0 ? cell : null;
        }
      }
      column += across;
    }
  });
  return grid;
}

function cellSpans(cell: Element, row: Element | null, table: Element): string {
  const rowspan = row ? resolvedRowspan(cell, row, table) : spanAttribute(cell, 'rowspan');
  return `${spanAttribute(cell, 'colspan')}${rowspan}`;
}

function serializeStructuralTable(table: Element, options: MarkItDownOptions): string {
  const lines: string[] = ['<table>'];
  const caption = ownCaption(table);
  if (caption) lines.push(`<caption>${serializeCellContent(caption, options)}</caption>`);
  for (const row of ownRows(table)) {
    const cells = ownCells(row)
      .map((cell) => {
        const tag = cell.tagName.toLowerCase() === 'th' ? 'th' : 'td';
        const spans = cellSpans(cell, row, table);
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
    // Rows are rendered from the element itself, so the converted subtree would
    // be built and discarded — twice over for a nested table.
    ignoresChildContent: true,
    replacement(el, _childContent, options) {
      const analysis = analyzeTable(el);

      // 'flatten' is the default: an HTML table renders nowhere that Markdown
      // alone is read, and every cell inside one stops being Markdown, so the
      // structure is folded into the pipe form unless HTML is asked for.
      if (analysis.level === 'complex' && (options.complexTableFallback ?? 'flatten') !== 'flatten') {
        const fallback = options.complexTableFallback ?? 'flatten';
        if (fallback === 'skip') return captionOnly(el, options);
        if (fallback === 'text') {
          // The cell's characters, escaped here rather than converted. Routing
          // this mode through getCellContent was the other candidate and is the
          // wrong one: the converter answers with markup — **bold** for a
          // <strong>, a link for an <a>, a code span per line of a <pre> — and
          // this mode exists to produce none. What it does owe the reader is the
          // rest of the contract every other path keeps: text the page merely
          // *showed* must render as itself. Before this, `**bold**` on the page
          // came back as real bold and `<img src=x onerror=…>` as working
          // markup, because textContent reaches the file without ever passing a
          // rule that escapes.
          //
          // Escaping inside a <pre>, <code> or a formula is corruption
          // elsewhere, but not here: this mode strips the code span and the
          // dollar signs too, so the text lands in ordinary prose where a lone
          // `*` really would start emphasis.
          const rows = ownRows(el).map((row) =>
            ownCells(row)
              .map((c) =>
                // After the escaping, not before: escapeCellText doubles the
                // backslashes it finds, so escaping the pipe first produced
                // `\\|` — a literal backslash next to a live separator.
                escapeCellPipes(
                  escapeCellText(
                    // A newline inside a cell would split the row this mode builds.
                    (c.textContent ?? '').trim().replace(/\s*\n+\s*/g, ' '),
                  ),
                ),
              )
              .join(' | '),
          );
          // Once per row, on the finished line: a row is a line of the document
          // here, so a leading `#`, `>`, `- ` or a row that is nothing but
          // dashes opens a block. A `#` in the second cell is mid-sentence and
          // needs nothing, which is why this cannot be done per cell.
          const text = escapeBlockStarts(rows.join('\n'));
          const caption = captionLine(el, options);
          return caption ? `\n\n${caption}\n${text}\n\n` : `\n\n${text}\n\n`;
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
      // An empty <thead> — CMS and spreadsheet exports write them — reports
      // hasHead without providing a row; the first body row is the header then.
      const headerRow = headRows[0] ?? allRows[0] ?? null;
      if (!headerRow) {
        return captionOnly(el, options);
      }
      const bodyRowEls = allRows.filter((row) => row !== headerRow);

      // From the grid, not from the row's own cells: a merged cell occupies
      // positions its row does not list, and reading the cells directly put the
      // columns out of step with each other.
      const grid = expandSpans(allRows, el);
      const rowIndex = new Map(allRows.map((row, index) => [row, index]));
      const positionsOf = (row: Element): (Element | null)[] =>
        grid[rowIndex.get(row) ?? -1] ?? [];
      const contentOf = (cell: Element | null | undefined): string =>
        cell ? getCellContent(cell, options) : '';

      const headerCells = positionsOf(headerRow);
      const headers = Array.from(headerCells, contentOf);
      const alignments = headerCells.map((c) => (c ? getAlignment(c) : 'none'));

      const bodyData = bodyRowEls.map((row) => Array.from(positionsOf(row), contentOf));

      if (headers.every((h) => !h) && bodyData.length === 0) return captionOnly(el, options);

      // A body row may be wider than the header: the table widens rather than
      // dropping the extra cells.
      const columnCount = Math.max(headers.length, ...bodyData.map((row) => row.length));
      while (headers.length < columnCount) headers.push('');
      while (alignments.length < columnCount) alignments.push('none');

      const table = buildGFMTable(headers, bodyData, alignments);
      // GFM has no caption, so it becomes the line above the table — losing it
      // silently is worse than moving it.
      const captionText = captionLine(el, options);
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
