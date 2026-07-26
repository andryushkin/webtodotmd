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

function firstCodePoint(text: string): string | undefined {
  if (text.length === 0) return undefined;
  const point = text.codePointAt(0);
  return point === undefined ? undefined : String.fromCodePoint(point);
}

function lastCodePoint(text: string): string | undefined {
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
// `preformattedLines` in the table rules.
const BLOCK_BOUNDARY = new Set([
  'p', 'div', 'li', 'td', 'th', 'blockquote', 'section', 'article', 'main', 'dd',
  'dt', 'figcaption', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre',
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
 */
function endsLine(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'br' || tag === 'hr' || BLOCK_BOUNDARY.has(tag);
}

const EMPHASIS_TAGS = new Set(['em', 'i', 'strong', 'b', 'del', 's']);
// Wrappers with no Markdown spelling at all: their rule always emits the tag.
const TAG_ONLY = new Set(['sub', 'sup']);

/**
 * Whether this element becomes emphasis — delimiters, or the tag they fall back
 * to. Content that is empty or all whitespace is not wrapped at all, and a
 * neighbour must not expect a delimiter from it.
 */
function emitsEmphasis(el: Element): boolean {
  return EMPHASIS_TAGS.has(el.tagName.toLowerCase()) && (el.textContent ?? '').trim() !== '';
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

function neighbour(el: Element, side: 'start' | 'end'): Node | undefined {
  let node: Node = el;
  for (;;) {
    for (
      let sibling = side === 'start' ? node.previousSibling : node.nextSibling;
      sibling;
      sibling = side === 'start' ? sibling.previousSibling : sibling.nextSibling
    ) {
      const found = edgeNode(sibling, side === 'start' ? 'end' : 'start');
      if (found) return found;
    }
    const parent = node.parentElement;
    if (!parent || BLOCK_BOUNDARY.has(parent.tagName.toLowerCase())) return undefined;
    node = parent;
  }
}

function neighbourChar(el: Element, side: 'start' | 'end'): string | undefined {
  const node = neighbour(el, side);
  if (node === undefined) return undefined;
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
  const node = neighbour(el, 'start');
  if (node === undefined || node.nodeType !== ELEMENT_NODE) return false;
  const prev = node as Element;
  return emitsEmphasis(prev) && edgeDelimiter(prev, 'end') === '*';
}
