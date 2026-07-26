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
