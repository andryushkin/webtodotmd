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
import {
  BOLD_THRESHOLD,
  BOLD_WEIGHT,
  NORMAL_WEIGHT,
  displayFrom,
  elementStyle,
  hidingVerdict,
  italicFrom,
  struckFrom,
  weightFrom,
} from '../../core/src/utils/inline-style.js';
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

// A `display` the page states decides this before the tag does: `<span
// style="display:block">` is a line of its own on screen, and a `<div
// style="display:inline">` is not. `elementStyle` is what the converter reads —
// the style attribute and a recorded computed style both — so an oracle that went
// by the tag alone would report the agreement as a difference.
function isBlockBox(el: Element): boolean {
  const display = displayFrom(elementStyle(el));
  if (display === 'block') return true;
  if (display === 'inline') return false;
  return BLOCK_TAGS.has(el.tagName.toLowerCase());
}

function collectText(node: Node, out: string[]): void {
  if (node.nodeType === TEXT_NODE) {
    out.push(node.textContent ?? '');
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;

  // Styled out of the render: the converter drops it, and so did the reader's eye.
  const hiding = hidingVerdict(node as Element);
  if (hiding === 'removed') return;
  const block = isBlockBox(node as Element);
  if (block) out.push('\n');
  for (const child of Array.from(node.childNodes)) {
    // An invisible box kept for a descendant that declared itself visible again
    // paints none of its own text, and the converter drops exactly those nodes
    // (`dropOwnText` in the sanitizer). Asking only "is this removed" here would
    // read them as seen and report that removal as a loss. Whitespace stays on
    // both sides: a blank looks the same either way, and the box holds its width
    // open, so dropping it would weld the visible runs into one word.
    const glyphs = child.nodeType === TEXT_NODE && /\S/.test(child.textContent ?? '');
    if (hiding === 'invisible-but-kept' && glyphs) continue;
    collectText(child, out);
  }
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
    .replace(SHIFTED, (ch) => SHIFTED_BACK.get(ch) ?? ch)
    .trim();
}

// A raised or lowered run converts to the Unicode character for it, so `<sub>2`
// leaves the page as `2` and comes back from the file as `₂`. To a reader those
// are one character drawn small and low, but `textContent` reads the plain digit
// going in and the shifted one coming back, and every formula would be reported
// as a defect. Folded on both sides, so a page that itself prints `₂` still
// round-trips as itself.
const SHIFTED_BACK = new Map(
  Object.entries({
    '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4', '\u2075': '5',
    '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9', '\u207a': '+', '\u207b': '-',
    '\u207c': '=', '\u207d': '(', '\u207e': ')', '\u207f': 'n', '\u2071': 'i', '\u1d43': 'a',
    '\u1d47': 'b', '\u1d9c': 'c', '\u1d48': 'd', '\u1d49': 'e', '\u1da0': 'f', '\u1d4d': 'g',
    '\u02b0': 'h', '\u02b2': 'j', '\u1d4f': 'k', '\u02e1': 'l', '\u1d50': 'm', '\u1d52': 'o',
    '\u1d56': 'p', '\u02b3': 'r', '\u02e2': 's', '\u1d57': 't', '\u1d58': 'u', '\u1d5b': 'v',
    '\u02b7': 'w', '\u02e3': 'x', '\u02b8': 'y', '\u1dbb': 'z',
    '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4', '\u2085': '5',
    '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9', '\u208a': '+', '\u208b': '-',
    '\u208c': '=', '\u208d': '(', '\u208e': ')', '\u2090': 'a', '\u2091': 'e', '\u2095': 'h',
    '\u1d62': 'i', '\u2c7c': 'j', '\u2096': 'k', '\u2097': 'l', '\u2098': 'm', '\u2099': 'n',
    '\u2092': 'o', '\u209a': 'p', '\u1d63': 'r', '\u209b': 's', '\u209c': 't', '\u1d64': 'u',
    '\u1d65': 'v', '\u2093': 'x',
  }),
);

const SHIFTED = new RegExp(`[${[...SHIFTED_BACK.keys()].join('')}]`, 'g');

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

// What a fact is named after, not what tag produced it. `<code>`, `<kbd>` and
// `<samp>` make the same claim — the core turns the last two into code spans, so
// demanding the tag back would fail on a conversion that is entirely correct.
//
// The emphasis tags used to be listed here and are not any more: bold, italic and
// strikethrough are read off the *face* now, below, because a page states them in
// two languages and only one of them is a tag.
//
// A Map for the reason `FACE_TAGS` below is one: a `<constructor>` element is
// markup a page may write, and an object literal answered it with `Object` — a
// truthy value, so the oracle claimed a fact named after a native function and
// then failed to find it on the other side of the round trip.
const FACT_TAGS = new Map<string, string>([
  ['code', 'code'],
  ['kbd', 'code'],
  ['samp', 'code'],
  ['sub', 'sub'],
  ['sup', 'sup'],
  ['blockquote', 'quote'],
  ['li', 'item'],
  ['h1', 'h1'],
  ['h2', 'h2'],
  ['h3', 'h3'],
  ['h4', 'h4'],
  ['h5', 'h5'],
  ['h6', 'h6'],
]);

// ---------------------------------------------------------------------------
// Typeface, which is a claim a page makes in two languages.
//
// `<b>bold</b>` and `<span style="font-weight:700">bold</span>` put the same
// thing on the screen, and the oracle has to agree with itself about that or it
// cannot measure the conversion at all: the input says it one way, the rendered
// Markdown always says it the other. So the fact comes from the face the reader
// sees — weight, slant, line — and not from the tag that produced it.
//
// A fact is emitted where the face *changes*, never where it merely holds. That
// is the difference between "this run is bold" and "this run is bolder than what
// surrounds it", and the second is the only one that survives a round trip: a
// `<th>` and an `<h2>` are painted bold by every renderer, so a `**` inside one
// is a mark the page never showed and the converter deliberately declines to
// write. Recording the *state* instead would report that decision as a defect on
// every table header there is.
//
// The CSS value readers are the core's own. What a `font-weight: bolder`
// resolves to is not where conversion defects live, and a second copy of that
// arithmetic would only drift; what this file must own — and does, below — is
// which elements are held to make a claim, and when.
interface Face {
  weight: number;
  italic: boolean;
  strike: boolean;
}

// The thresholds are the core's own, imported for the reason the readers are:
// a second copy would let the core move its idea of "bold enough" while this
// file went on measuring against the old one and called every semibold run a
// defect. What this file owns is which elements are held to make a claim.
const PLAIN: Face = { weight: NORMAL_WEIGHT, italic: false, strike: false };

// The tags that state a face, and the mark each one states. A Map, like the
// core's own lookups: the key is a tag name off the page, and an object literal
// answers `constructor` and every other name on `Object.prototype` with a
// function that is not a mark.
const FACE_TAGS = new Map<string, keyof Face>([
  ['b', 'weight'],
  ['strong', 'weight'],
  ['i', 'italic'],
  ['em', 'italic'],
  ['cite', 'italic'],
  ['s', 'strike'],
  ['del', 'strike'],
  ['strike', 'strike'],
]);

// Bold because of what they are, not because of what they say: a heading carries
// its weight into everything inside it and cannot hand it back through a Markdown
// mark. Such an element raises the face for its children and claims nothing of
// its own — recording the claim would report `## Title` as having lost the bold
// that `#` is.
const BOLD_BLOCKS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * A cell that is read as a header, which is bold in every renderer there is.
 *
 * The first row, whatever tag it was written with. This file already reads a
 * table that way — `tableFacts` names every column after `grid[0]` — and a pipe
 * table has only that form: its first row becomes `<th>` on the way out no matter
 * what came in. Weighing a `<td>` there as an ordinary cell made the oracle
 * disagree with itself, and `<table><tr><td><b>a</b>` reported a bold that the
 * conversion had kept perfectly.
 */
function isHeaderCell(el: Element): boolean {
  const tag = tagOf(el);
  if (tag === 'th') return true;
  if (tag !== 'td') return false;
  const row = el.parentElement;
  if (!row || tagOf(row) !== 'tr') return false;
  let table: Element | null = row.parentElement;
  while (table !== null && tagOf(table) !== 'table') table = table.parentElement;
  return table !== null && ownRows(table)[0] === row;
}

function boldByItself(el: Element): boolean {
  return BOLD_BLOCKS.has(tagOf(el)) || isHeaderCell(el);
}

function faceOf(el: Element, parent: Face): Face {
  const read = elementStyle(el);
  const mark = FACE_TAGS.get(tagOf(el));
  const boldByTag = mark === 'weight' || boldByItself(el);
  return {
    weight: weightFrom(read, parent.weight) ?? (boldByTag ? BOLD_WEIGHT : parent.weight),
    italic: italicFrom(read) ?? (mark === 'italic' || parent.italic),
    strike: struckFrom(read) ?? (mark === 'strike' || parent.strike),
  };
}

function faceFacts(el: Element, parent: Face, own: Face, out: string[]): void {
  const text = factText(el);
  // A mark around nothing claims nothing — the same rule `MARKS` states below.
  if (text === '') return;
  if (own.weight >= BOLD_THRESHOLD && parent.weight < BOLD_THRESHOLD && !boldByItself(el)) {
    out.push(`strong:${text}`);
  }
  if (own.italic && !parent.italic) out.push(`em:${text}`);
  if (own.strike && !parent.strike) out.push(`del:${text}`);
}

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

// An inline mark around nothing claims nothing: `<code></code>` has no text that
// could come back unwrapped, so dropping it is not a loss. A link is the
// exception — its target is a claim on its own, and one that vanished is worth
// seeing. `faceFacts` applies the same rule to the marks it reads off the face.
const MARKS = new Set(['code', 'sub', 'sup']);

function collectFacts(node: Node, out: string[], inherited: Face = PLAIN): void {
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = tagOf(el);
  // Styled out of the render: there was nothing on the screen here to claim
  // anything about, which is why the converter drops it too. Only `'removed'`:
  // an invisible box kept for a visible descendant still makes its claims, about
  // the text that is left once `collectText` has taken its own away.
  if (hidingVerdict(el) === 'removed') return;
  const face = faceOf(el, inherited);

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
    out.push(`${FACT_TAGS.get(tag) ?? tag}:${factText(el)}`);
    return; // characters from here down, not structure
  } else if (isParagraph(el)) {
    out.push(`para:${factText(el)}`);
  } else {
    const fact = FACT_TAGS.get(tag);
    const text = fact ? factText(el) : '';
    if (fact && !(text === '' && MARKS.has(fact))) out.push(`${fact}:${text}`);
  }

  // After the tag's own claim and before the children's, so that an element
  // making both — `<li style="font-weight:bold">` — lists them in the order the
  // rendered `<li><strong>` will.
  faceFacts(el, inherited, face, out);

  for (const child of Array.from(el.childNodes)) collectFacts(child, out, face);
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
