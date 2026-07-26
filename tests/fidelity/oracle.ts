// Round-trip fidelity oracle.
//
// Every escaping defect found so far is one thing: text the page showed as
// characters became markup, or markup the core emitted was shown as characters.
// Both are visible as a change in the text the reader ends up with, so one
// comparison catches them without anyone having to invent the case first:
//
//   visible_text(input) === visible_text(render(convert(input)))
//
// One level: the preview renders exactly what the core emits. It used to escape
// tags in the finished Markdown first, which made a second measurement necessary;
// that pass is gone, and `tests/fidelity/no-live-markup.test.ts` is what stands
// in its place.
//
// Collapsing to characters is what lets this compare two documents that lay the
// same sentence out differently, and it is also everything this oracle cannot
// see: emphasis that came back plain, a link whose target moved, a cell under the
// wrong header. `structure()` at the bottom of this file answers that second
// question. It is a companion, not a successor — a list of structural claims says
// nothing about the characters between the marks, which is the whole of what the
// escaping defects were.
//
// DOMPurify is deliberately absent: under linkedom it does not sanitize at all
// (a <script> passes straight through), so including it would only be theatre.
import { parseHTML } from 'linkedom';
import { marked } from '../../vendor/marked.esm.js';
import { toMarkdown, setDOMAdapter } from '../../core/src/server.js';
import { CONVERSION_OPTIONS } from '../../src/content/raw-mathml-rule';

export function installDOMAdapter(): void {
  setDOMAdapter((html: string) => parseHTML(html).document as unknown as Document);
}

// The same options the side panel renders with (src/sidepanel/sidepanel.ts:23),
// so the oracle sees the markup the user sees.
const MARKED_OPTIONS = { breaks: true, gfm: true, html: true, async: false } as const;

// A block boundary separates words on screen, but `textContent` concatenates
// across it: a <caption> next to a <td> reads back as "captioncell". Markdown puts
// a real line break there, so the two documents would differ over nothing at all.
// Boundaries are marked on both sides instead, then collapsed like any whitespace.
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'caption', 'dd', 'div', 'dl',
  'dt', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function collectText(node: Node, out: string[]): void {
  if (node.nodeType === TEXT_NODE) {
    out.push(node.textContent ?? '');
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;

  const block = BLOCK_TAGS.has((node as Element).tagName.toLowerCase());
  if (block) out.push('\n');
  for (const child of Array.from(node.childNodes)) collectText(child, out);
  if (block) out.push('\n');
}

/**
 * The characters a reader ends up with, independent of how they were laid out.
 * Markdown legitimately moves whitespace around — a list marker, a wrapped line,
 * an indented block — so whitespace is collapsed before comparing; anything else
 * that changes is a difference in what the page said.
 */
export function visibleText(html: string): string {
  // linkedom needs the full skeleton: a bare <body> fragment yields empty text.
  const doc = parseHTML(`<html><body>${html}</body></html>`).document;
  const out: string[] = [];
  if (doc.body) collectText(doc.body, out);
  return out
    .join('')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function render(md: string): string {
  return marked.parse(md, MARKED_OPTIONS) as string;
}

export interface RoundTrip {
  markdown: string;
  rendered: string;
  expected: string;
  actual: string;
  faithful: boolean;
}

function run(html: string, md: string): RoundTrip {
  const rendered = render(md);
  const expected = visibleText(html);
  const actual = visibleText(rendered);
  return { markdown: md, rendered, expected, actual, faithful: expected === actual };
}

// The content script's own options, not the library defaults: with `math: false`
// the math rules never run, and the survey would be measuring a configuration the
// product does not ship. `baseUrl` is the only field left out — it varies per page
// and does not affect fidelity.
function convert(html: string): string {
  return toMarkdown(html, { ...CONVERSION_OPTIONS });
}

/** Does the Markdown still say what the page said? */
export function roundTrip(html: string): RoundTrip {
  return run(html, convert(html));
}

/** A readable one-block report — what the page said, what the reader got. */
export function describeFailure(html: string, trip: RoundTrip): string {
  return [
    `input:    ${html}`,
    `markdown: ${JSON.stringify(trip.markdown)}`,
    `rendered: ${JSON.stringify(trip.rendered)}`,
    `expected: ${JSON.stringify(trip.expected)}`,
    `actual:   ${JSON.stringify(trip.actual)}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// The structural oracle — a second question, not a better answer to the first.
//
// `visibleText` deliberately throws away everything but the characters, which is
// what lets it compare two documents that lay the same sentence out differently.
// The cost is that it is blind to every difference that keeps the characters:
// emphasis that came back as plain text, a link whose target changed, a cell that
// landed under the wrong header, an image that turned into its alt, two paragraphs
// that merged into one. All of those read identically to the text oracle.
//
// So this is a companion, not a replacement. It lists the *claims* a document
// makes about its own content — this run is emphasised, this text points there,
// this cell sits under that header — and a round trip has to come back with the
// same list. Both oracles run over the same round trip; each one sees what the
// other cannot, and the text oracle stays load-bearing because a structural list
// says nothing about the characters between the marks.
// ---------------------------------------------------------------------------

// Whitespace is laid out by Markdown, not chosen by the page, and it is laid out
// differently on each side: a nested list writes `<li>one<ul>` with nothing
// between the words, the Markdown puts a newline there. Fact text therefore goes
// through the same block-boundary marking the text oracle uses, so that "one deep"
// is what both sides say.
function factText(el: Element): string {
  const out: string[] = [];
  collectText(el, out);
  return out
    .join('')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A link that only gained `%20` where it had a space points at the same place —
// percent-encoding is how a Markdown link spells a URL, not a different target.
// `decodeURI` leaves the reserved characters alone, so `%26` and `%23` still read
// as deliberate, and a genuinely rewritten target still shows up.
function normUrl(url: string): string {
  try {
    return decodeURI(url.trim());
  } catch {
    return url.trim();
  }
}

// What a fact is named after, not what tag produced it. `<b>` and `<strong>` make
// the same claim, and so do `<code>`, `<kbd>` and `<samp>` — the core turns the
// last two into code spans, so demanding the tag back would fail on a conversion
// that is entirely correct.
const FACT_TAGS: Readonly<Record<string, string>> = {
  b: 'strong',
  strong: 'strong',
  i: 'em',
  em: 'em',
  cite: 'em',
  code: 'code',
  kbd: 'code',
  samp: 'code',
  s: 'del',
  del: 'del',
  strike: 'del',
  sub: 'sub',
  sup: 'sup',
  blockquote: 'quote',
  li: 'item',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
};

// Literal contexts: their content is characters, not structure. Descending would
// report a `<code>` inside every `<pre>` the renderer builds and none inside the
// bare `<pre>` a page wrote, which is a difference in nothing.
const OPAQUE = new Set(['pre', 'code', 'kbd', 'samp']);

function childElements(node: Element): Element[] {
  return Array.from(node.childNodes).filter(
    (child) => child.nodeType === ELEMENT_NODE,
  ) as unknown as Element[];
}

function tagOf(el: Element): string {
  return el.tagName.toLowerCase();
}

// Rows of *this* table: a nested table's rows belong to the nested table, and
// querySelectorAll would hand them to both.
function ownRows(table: Element): Element[] {
  const rows: Element[] = [];
  const walk = (parent: Element): void => {
    for (const child of childElements(parent)) {
      const tag = tagOf(child);
      if (tag === 'tr') rows.push(child);
      else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') walk(child);
    }
  };
  walk(table);
  return rows;
}

// A hostile `colspan="99999"` is a page's prerogative; allocating it is not.
// Browsers cap too, and past a couple of dozen columns nothing about the shape is
// still in question.
const SPAN_CAP = 24;

function spanOf(cell: Element, name: string): number {
  const raw = Number.parseInt(cell.getAttribute(name) ?? '1', 10);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.min(raw, SPAN_CAP);
}

// The grid the reader sees, which is not the order the cells are written in: a
// `rowspan` above pushes the next row's first cell one column right. Reading the
// cells positionally instead would report that shifted cell as wrong on the input
// side and right on the output side — a difference invented by the oracle. So the
// spans are resolved into occupancy exactly as the HTML table model does, and a
// spanned cell reads as its own text in every slot it covers: that is what was on
// the screen.
function gridOf(table: Element): string[][] {
  const cellsOf = (row: Element): Element[] =>
    childElements(row).filter((c) => tagOf(c) === 'td' || tagOf(c) === 'th');

  const grid: string[][] = [];
  ownRows(table).forEach((row, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of cellsOf(row)) {
      while (grid[r]![c] !== undefined) c++;
      const cols = spanOf(cell, 'colspan');
      const rows = spanOf(cell, 'rowspan');
      const text = factText(cell);
      for (let dr = 0; dr < rows; dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < cols; dc++) grid[r + dr]![c + dc] = text;
      }
      c += cols;
    }
  });
  return grid;
}

// A cell's identity is its column, and a column's identity is its header. Naming
// the column by position instead would call a shifted cell correct as long as
// something landed in the slot.
function tableFacts(table: Element, out: string[]): void {
  const grid = gridOf(table);
  const width = grid.reduce((w, row) => Math.max(w, row.length), 0);
  const headers = grid[0] ?? [];
  for (const row of grid) {
    for (let c = 0; c < width; c++) {
      out.push(`cell:${headers[c] ?? `col${c}`}|${row[c] ?? ''}`);
    }
  }
  for (const child of childElements(table)) {
    if (tagOf(child) === 'caption') out.push(`caption:${factText(child)}`);
  }
}

// A `<div>` of plain text is a paragraph on screen and a paragraph in the
// rendered Markdown, so it has to make the same claim as a `<p>` or every page
// built out of divs reports a difference in nothing. A `<div>` that wraps other
// blocks is a container, not a paragraph, and claims nothing of its own.
function isParagraph(el: Element): boolean {
  const tag = tagOf(el);
  if (tag === 'p') return true;
  if (tag !== 'div') return false;
  return childElements(el).every((child) => !BLOCK_TAGS.has(tagOf(child)) || tagOf(child) === 'br');
}

// An inline mark around nothing claims nothing: `<b></b>` has no text that could
// come back unemphasised, so dropping it is not a loss. A link is the exception —
// its target is a claim on its own, and one that vanished is worth seeing.
const MARKS = new Set(['strong', 'em', 'del', 'code', 'sub', 'sup']);

function collectFacts(node: Node, out: string[]): void {
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = tagOf(el);

  if (tag === 'table') tableFacts(el, out);

  if (tag === 'a') {
    // The target is the whole point of a link: text that survives while the href
    // changes is a link to somewhere else wearing the right label.
    out.push(`link:${factText(el)}->${normUrl(el.getAttribute('href') ?? '')}`);
  } else if (tag === 'img') {
    out.push(`image:${el.getAttribute('alt') ?? ''}->${normUrl(el.getAttribute('src') ?? '')}`);
  } else if (tag === 'br') {
    out.push('break');
  } else if (OPAQUE.has(tag)) {
    out.push(`${FACT_TAGS[tag] ?? tag}:${factText(el)}`);
    return; // characters from here down, not structure
  } else if (isParagraph(el)) {
    out.push(`para:${factText(el)}`);
  } else {
    const fact = FACT_TAGS[tag];
    const text = fact ? factText(el) : '';
    if (fact && !(text === '' && MARKS.has(fact))) out.push(`${fact}:${text}`);
  }

  for (const child of Array.from(el.childNodes)) collectFacts(child, out);
}

/**
 * The claims a document makes about its own content, in document order.
 * Two documents with the same list say the same things about the same text.
 */
export function structure(html: string): string[] {
  const doc = parseHTML(`<html><body>${html}</body></html>`).document;
  const out: string[] = [];
  if (doc.body) for (const child of Array.from(doc.body.childNodes)) collectFacts(child, out);
  return out;
}

export interface StructuralTrip {
  markdown: string;
  rendered: string;
  expected: string[];
  actual: string[];
  faithful: boolean;
}

/** Does the Markdown still claim what the page claimed? */
export function roundTripStructure(html: string): StructuralTrip {
  const markdown = convert(html);
  const rendered = render(markdown);
  const expected = structure(html);
  const actual = structure(rendered);
  return {
    markdown,
    rendered,
    expected,
    actual,
    faithful: expected.length === actual.length && expected.every((f, i) => f === actual[i]),
  };
}

/** A readable one-block report — which claims went missing, which appeared. */
export function describeStructuralFailure(html: string, trip: StructuralTrip): string {
  const lost = trip.expected.filter((f) => !trip.actual.includes(f));
  const gained = trip.actual.filter((f) => !trip.expected.includes(f));
  return [
    `input:    ${html}`,
    `markdown: ${JSON.stringify(trip.markdown)}`,
    `expected: ${JSON.stringify(trip.expected)}`,
    `actual:   ${JSON.stringify(trip.actual)}`,
    `lost:     ${JSON.stringify(lost)}`,
    `gained:   ${JSON.stringify(gained)}`,
  ].join('\n');
}
