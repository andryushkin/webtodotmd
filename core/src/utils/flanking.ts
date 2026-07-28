import {
  addedMarks,
  displaysAsBlock,
  isHighlighted,
  laysARow,
  suppressedMarks,
  type StyleMarks,
} from './inline-style.js';
import { SEMANTIC_BLOCKS } from './blocks.js';

export function extractFlankingWhitespace(content: string): {
  leading: string;
  trimmed: string;
  trailing: string;
} {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content);
  return {
    leading: match?.[1] ?? '',
    trimmed: match?.[2] ?? '',
    trailing: match?.[3] ?? '',
  };
}

// CommonMark decides whether `*` or `_` opens emphasis from the two characters
// around the run, not from the tags in the source. Emitting `_x_` without asking
// produced text where the page had italics: `word<i>**</i>` became `word_\*\*_`,
// whose opening `_` sits between a letter and punctuation and so opens nothing —
// the reader lost the emphasis and gained two underscores.
//
// Undefined means the edge of the line, which the spec treats as whitespace.

function isWhitespace(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch);
}

// The spec's "Unicode punctuation character": the P categories plus symbols.
function isPunctuation(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{P}\p{S}]/u.test(ch);
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

// A character here means a Unicode code point, not a UTF-16 unit. Indexing with
// `[0]` handed the tests half a surrogate pair, which is in no category at all:
// `a<em>😀</em>b` was judged as ordinary content, written `a*😀*b`, and rendered
// with the asterisks visible and no emphasis — the emoji is symbol punctuation,
// so pressed against a letter neither `*` nor `_` can open there and the tag is
// the only spelling that works.

export function firstCodePoint(text: string): string | undefined {
  if (text.length === 0) return undefined;
  const point = text.codePointAt(0);
  return point === undefined ? undefined : String.fromCodePoint(point);
}

export function lastCodePoint(text: string): string | undefined {
  if (text.length === 0) return undefined;
  // Step back over a trailing low surrogate, but only when a high surrogate is
  // really in front of it — a lone one is its own (invalid) character.
  const tail = text.charCodeAt(text.length - 1);
  const paired =
    text.length >= 2 &&
    tail >= 0xdc00 &&
    tail <= 0xdfff &&
    text.charCodeAt(text.length - 2) >= 0xd800 &&
    text.charCodeAt(text.length - 2) <= 0xdbff;
  return text.slice(paired ? -2 : -1);
}

/** Left-flanking: the run can begin emphasis. */
export function isLeftFlanking(before: string | undefined, after: string | undefined): boolean {
  if (isWhitespace(after)) return false;
  return !isPunctuation(after) || isWhitespace(before) || isPunctuation(before);
}

/** Right-flanking: the run can end emphasis. */
export function isRightFlanking(before: string | undefined, after: string | undefined): boolean {
  if (isWhitespace(before)) return false;
  return !isPunctuation(before) || isWhitespace(after) || isPunctuation(after);
}

/**
 * Whether `marker…marker` around `content` actually renders as emphasis, given
 * the characters it will sit between.
 */
export function markerWorks(
  marker: string,
  content: string,
  before: string | undefined,
  after: string | undefined,
): boolean {
  const first = firstCodePoint(content);
  const last = lastCodePoint(content);

  // The opening run sits between `before` and the content's first character; the
  // closing run between its last character and `after`.
  if (!isLeftFlanking(before, first)) return false;
  if (!isRightFlanking(last, after)) return false;

  if (marker.startsWith('_')) {
    // `_` additionally never works inside a word, which is what keeps
    // snake_case from turning into emphasis.
    if (isWordChar(before) || isWordChar(after)) return false;
    // And a run that flanks both ways may only open when punctuation precedes it.
    if (isRightFlanking(before, first) && !isPunctuation(before)) return false;
    if (isLeftFlanking(last, after) && !isPunctuation(after)) return false;
  }
  return true;
}

// Where a line ends, and with it the chance of anything joining onto it. The same
// tags the parser calls `LINE_ENDS`, written out a second time because that set is
// unexported and importing it would tie this file to the parser — the precedent is
// `preformattedLines` in the table rules. The semantic containers come from the
// set both of those read, so at least that half cannot drift.
const BLOCK_BOUNDARY = new Set([
  'p', 'div', 'li', 'td', 'th', 'blockquote', 'dd', 'dt', 'caption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', ...SEMANTIC_BLOCKS,
]);

const ELEMENT_NODE = 1;

/**
 * Whether this element's output ends the line it is on.
 *
 * A `<br>` joins the blocks because it is a line ending and nothing else, which is
 * how the parser reads it too — `opensBlock()` names it beside the same set. An
 * `<hr>` writes `---` between two blank lines and so ends one as surely. The
 * parser knows neither of those about an `<hr>`, which is a gap of its own and not
 * one to copy: it is why `<div>x<hr>## y</div>` writes the page's `## y` as a real
 * heading.
 *
 * A `display` that makes an inline element a block ends the line as well — the
 * converter writes it as its own paragraph, so nothing on either side of it can
 * collide with anything on the other.
 */
function endsLine(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'br' || tag === 'hr' || BLOCK_BOUNDARY.has(tag) || displaysAsBlock(el);
}

// The tag each wrapper's mark comes from, which is also the mark its own style
// can decline: a `<strong style="font-weight:normal">` emits nothing, and a
// neighbour that expected a delimiter from it would give up its own for nothing.
//
// A Map because the key is a tag name off the page and an object literal answers
// `constructor` and the rest of `Object.prototype` with a function: an unknown
// `<constructor>` element read as an emphasis wrapper, and the `<em>` beside it
// gave up `*b*` for `<em>b</em>` against a delimiter that was never written.
const EMPHASIS_TAGS = new Map<string, keyof StyleMarks>([
  ['em', 'italic'],
  ['i', 'italic'],
  ['strong', 'bold'],
  ['b', 'bold'],
  ['del', 'strike'],
  ['s', 'strike'],
]);
// Wrappers whose rule emits a tag rather than text, so a neighbour meets `<` or
// `>` where it would otherwise meet a letter. Empty now that `<sub>`/`<sup>`
// shifted to Unicode: they write characters like any other run, and a neighbour
// deciding its marker against a `<` that no longer arrives chose `_` where the
// letter after it forbids one — `<i>x</i><sub>x</sub>` came out `_x_ₓ`, which
// renders as its own underscores.
const TAG_ONLY = new Set<string>();

// Where the content is characters rather than markup, so nothing inside spells a
// delimiter at all. The same sets `parser.ts` names, written out a second time
// for the same reason `BLOCK_BOUNDARY` above is — importing them would tie this
// file to the parser, and the parser already imports this one.
const LITERAL_TAGS = new Set(['pre', 'code', 'kbd', 'samp']);
const MATH_TAGS = new Set(['math', 'mjx-container', 'annotation']);

/**
 * Whether this element's content is characters rather than markup.
 *
 * `convert()` asks exactly this before it lets a style emit anything, because a
 * `**` inside a fence or a code span is two characters of the sample. This file
 * has to ask it too: a syntax highlighter puts a `<span style="font-weight:bold">`
 * on every keyword, and `followsEmphasis` walked *into* the code span, found one,
 * and made the `<em>` after the span fall back to `<em>` tags — against a
 * delimiter the highlighted span never wrote, since what really ends a code span
 * is its backtick.
 */
function inLiteral(el: Element): boolean {
  for (let up: Element | null = el; up; up = up.parentElement) {
    const tag = up.tagName.toLowerCase();
    if (LITERAL_TAGS.has(tag) || MATH_TAGS.has(tag) || up.classList?.contains('katex')) return true;
  }
  return false;
}

/**
 * Whether this element becomes emphasis — delimiters, or the tag they fall back
 * to. Content that is empty or all whitespace is not wrapped at all, and a
 * neighbour must not expect a delimiter from it.
 *
 * A style is a second source of the same marks, and one with no tag to give it
 * away: `<span style="font-weight:700">a</span><b>c</b>` writes `**a****c**`
 * unless this says yes for the span as well. A block is asked about first
 * because its delimiters, if it has any, are written *inside* it — what a
 * neighbour meets at its edge is the end of a line.
 *
 * A literal context answers no whatever it holds: the code rule takes its
 * element's *text*, so neither a tag nor a style inside one reaches the output.
 */
export function emitsEmphasis(el: Element): boolean {
  if ((el.textContent ?? '').trim() === '' || endsLine(el) || inLiteral(el)) return false;
  // A highlight writes `==` unconditionally, and it is not one of the three marks
  // a style can state or take back: the property that would say it is a
  // background, which nothing here reads. So it is asked for by tag and by
  // nothing else — a `<mark style="font-weight:normal">` is still highlighted.
  if (el.tagName.toLowerCase() === 'mark') return true;
  const mark = EMPHASIS_TAGS.get(el.tagName.toLowerCase());
  if (mark !== undefined && !suppressedMarks(el)[mark]) return true;
  const added = addedMarks(el);
  return added.bold || added.italic || added.strike || added.highlight;
}

/**
 * Whether this element's conversion writes `~~` against its own two edges.
 *
 * Strikethrough is the one mark whose delimiter a page can also *show*, and the
 * two have to share the characters: a lone `~` in the text beside a `<del>` runs
 * into the `~~` it writes, and `~~~x~~` is a tilde code fence — the text leaves
 * the page rather than gaining a stray marker. So the escaper asks this about a
 * text node's neighbours, which is why the answer is a tilde and not the
 * representative delimiter `edgeDelimiter` hands back below.
 *
 * Yes is the safe answer where it is uncertain: `emphasis()` may fall back to a
 * `<del>` tag against a colliding neighbour, and flanking whitespace inside the
 * element is lifted outside the delimiters. Both cost one backslash the reader
 * sees; being wrong the other way costs the text.
 */
export function emitsStrike(el: Element): boolean {
  if ((el.textContent ?? '').trim() === '' || endsLine(el) || inLiteral(el)) return false;
  if (EMPHASIS_TAGS.get(el.tagName.toLowerCase()) === 'strike') return !suppressedMarks(el).strike;
  return addedMarks(el).strike;
}

/**
 * The character an element's rule will put at one end of its output.
 *
 * A rule cannot see what its sibling emitted — rules run bottom-up and each hands
 * back a finished string — but it can see the sibling's *tag*, and for these tags
 * that is enough: an `<em>` writes `*`, `_` or `<em>`, and every one of those
 * begins and ends in punctuation. The flanking tests only ask which class the
 * neighbouring character falls in, never which character it is, so a
 * representative delimiter answers exactly as well as the real one would.
 *
 * Only tags that wrap unconditionally belong here. Claiming punctuation where the
 * output is really a word character is the dangerous direction — it lets `_`
 * through where `_` would sit inside a word and render as nothing — which is why
 * `<a>` and `<img>` are left out: their wrapping depends on the href and the src,
 * and reading their text is the safe answer.
 *
 * A code span is left out for a different reason. Its backtick is really there,
 * but emphasis is resolved *after* code spans are, and renderers disagree about
 * what the emphasis scanner then sees at that seam: the reference implementation
 * keeps the original backtick, marked — which renders the preview — has already
 * replaced the whole span with a token. `<b>**</b>` after a `` `` ``-delimited
 * span is judged renderable by the spec and comes out as six literal asterisks in
 * the panel. Reading the span's text instead only costs the preferred marker.
 */
function edgeDelimiter(el: Element, side: 'start' | 'end'): string | undefined {
  if (!emitsEmphasis(el)) {
    if (!TAG_ONLY.has(el.tagName.toLowerCase())) return undefined;
    return side === 'end' ? '>' : '<';
  }
  // The rule lifts flanking whitespace outside the delimiters, so a wrapper
  // whose text ends in a space really does end in that space.
  const text = el.textContent ?? '';
  const edge = side === 'end' ? lastCodePoint(text) : firstCodePoint(text);
  if (edge !== undefined && /\s/.test(edge)) return edge;
  return '*';
}

/**
 * The node whose output ends where this element's begins, and the mirror of it.
 *
 * Walks up through inline wrappers and stops at a block, where the line begins
 * and there is nothing in front. Descending into a wrapper matters as much as
 * climbing out of one: what ends `<span><em>a</em></span>` is the `<em>`, not the
 * letter `a`.
 *
 * A line ending is handed back as itself rather than skipped. Undefined means
 * "nothing of mine here, keep looking", and a `<br>` answered that: it holds no
 * text and spells no delimiter, so the search read straight past it and reported
 * the wrapper on the line above as this one's neighbour. `<em>a</em><br><em>b</em>`
 * was judged a pair of colliding delimiters and the second wrapper paid for it
 * with an HTML tag, on a line where `_b_` renders perfectly. Returning the element
 * needs nothing else of the callers: neither a `<br>` nor a block spells a
 * delimiter, so both read as the edge of a line, which is what they are.
 */
function edgeNode(node: Node, side: 'start' | 'end'): Node | undefined {
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    if (endsLine(el)) return el;
    if (edgeDelimiter(el, side) !== undefined) return el;
    for (
      let child = side === 'end' ? el.lastChild : el.firstChild;
      child;
      child = side === 'end' ? child.previousSibling : child.nextSibling
    ) {
      const found = edgeNode(child, side);
      if (found) return found;
    }
    return undefined;
  }
  return (node.textContent ?? '').length > 0 ? node : undefined;
}

function neighbour(el: Element, side: 'start' | 'end'): { node: Node; gap: boolean } | undefined {
  let node: Node = el;
  for (;;) {
    // Crossing out of one item of a row into the next: the file will carry a
    // blank there that the markup does not (`joinRow`). Without it every tag
    // after the first in a Stack Overflow tag list read as pressed against a
    // word, had no marker CommonMark would render, and fell back to `<strong>`.
    const gap = laysARow(node.parentElement);
    for (
      let sibling = side === 'start' ? node.previousSibling : node.nextSibling;
      sibling;
      sibling = side === 'start' ? sibling.previousSibling : sibling.nextSibling
    ) {
      const found = edgeNode(sibling, side === 'start' ? 'end' : 'start');
      if (found) return { node: found, gap };
    }
    const parent = node.parentElement;
    if (!parent || BLOCK_BOUNDARY.has(parent.tagName.toLowerCase())) return undefined;
    node = parent;
  }
}

function neighbourChar(el: Element, side: 'start' | 'end'): string | undefined {
  const found = neighbour(el, side);
  if (found === undefined) return undefined;
  if (found.gap) return ' ';
  const { node } = found;
  if (node.nodeType === ELEMENT_NODE) {
    return edgeDelimiter(node as Element, side === 'start' ? 'end' : 'start');
  }
  const text = node.textContent ?? '';
  return side === 'start' ? lastCodePoint(text) : firstCodePoint(text);
}

/** The character that will precede the element's output. */
export function charBefore(el: Element): string | undefined {
  return neighbourChar(el, 'start');
}

/** The character that will follow the element's output. */
export function charAfter(el: Element): string | undefined {
  return neighbourChar(el, 'end');
}

/**
 * Whether an emphasis delimiter ends immediately before this element's output.
 *
 * `charBefore` cannot answer this: the page's own `*` arrives escaped as `\*` and
 * joins onto nothing, while an `<em>` in front contributes a live delimiter that
 * runs into the next one. Only the tag tells the two apart.
 */
export function followsEmphasis(el: Element): boolean {
  const found = neighbour(el, 'start');
  // Across a row boundary the two delimiters have a blank between them and
  // cannot run into each other, which is the whole of what this asks.
  if (found === undefined || found.gap || found.node.nodeType !== ELEMENT_NODE) return false;
  const prev = found.node as Element;
  return emitsEmphasis(prev) && edgeDelimiter(prev, 'end') === '*';
}
