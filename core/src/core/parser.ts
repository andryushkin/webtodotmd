import type { MarkItDownOptions } from '../types.js';
import { findRule } from './rules.js';
import { applyStyleEmphasis, emitsCodeSpan } from '../rules/inline.js';
import {
  displaysAsBlock,
  displaysInline,
  drawnOnOneLine,
  LINE_ITEM_TAGS,
  laysARow,
  statesConversion,
  statesDisplay,
} from '../utils/inline-style.js';
import { emitsEmphasis, emitsStrike } from '../utils/flanking.js';
import {
  escapeBlockStarts,
  escapeHtmlSyntax,
  escapeInlineMarkdown,
  escapeMathTags,
  mayOpenLink,
} from './escape.js';

// Text inside these is emitted verbatim — as a code fence or a code span — so
// escaping it would corrupt the content instead of protecting it.
const LITERAL_TAGS = new Set(['pre', 'code', 'kbd', 'samp']);

// Math is literal too, but for a different reason and with a different remedy: a
// fence makes code inert, whereas LaTeX between dollar signs is not inert at all.
// With `math: false` — the library default — no math rule claims these elements,
// so their text falls through to here and used to arrive raw.
const MATH_TAGS = new Set(['math', 'mjx-container', 'annotation']);

// A line begins where a block begins, so `#`, `>`, a bullet or numbering can only
// be mistaken for markup in the text node that opens one of these.
const BLOCK_PARENTS = new Set([
  'p',
  'li',
  'td',
  'th',
  'blockquote',
  'div',
  'section',
  'article',
  'main',
  'dd',
  'dt',
  'figcaption',
  'caption',
]);

// Where the line ends, and with it the chance of anything joining onto it. Only
// the tags that hold text themselves need naming: the walk below stops at the
// first one it meets, and a `<li>` is reached long before its `<ul>`. Anything
// unlisted counts as inline, which costs at most a backslash — reading an
// unknown tag as a block boundary would cost the escape.
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const LINE_ENDS = new Set([...BLOCK_PARENTS, ...HEADING_TAGS, 'pre']);

// Everything that leaves the next text at the start of a line: the blocks above,
// plus the ones that are never a text node's parent and so are absent from them —
// a rule, a list, a table. `<br>` is here for the same reason it is in LINE_ENDS.
const ENDS_THE_LINE = new Set([
  ...LINE_ENDS, 'br', 'hr', 'ul', 'ol', 'dl', 'table', 'figure', 'form',
]);

// The blocks whose whole conversion is their content between blank lines. Only
// these can decline the block a `display:inline` says they did not draw: a `<br>`
// writes a break and no content, a `<table>` writes a grid and a `<pre>` a fence,
// and for those the tag's own output is still the closest the file can come.
const INLINEABLE_BLOCKS = new Set([...BLOCK_PARENTS, ...HEADING_TAGS]);

/**
 * Whether this element stood inside a line the reader saw whole, and holds
 * nothing that drew a line of its own.
 *
 * The defect it answers: a mention, a tag or a badge given a wrapper of its own
 * inside a flex row — `<span>Wow even</span><div><a>@karpathy</a></div><span>
 * admits …</span>`, which is ordinary React and is one sentence on screen. The
 * wrapper is a `<div>`, so it was written between blank lines, and a sentence
 * came back as three paragraphs with the remainder opening on a stray space.
 *
 * `data-s2md-row="line"` is the evidence and it is an observation, not a
 * conclusion: the content script asked a `Range` how many bands the container's
 * content was drawn on and counted one. The second half of the question is asked
 * here, because only the markup can answer it — a row of cards one line tall
 * measures as one band too, and what keeps those apart is that each card holds
 * blocks of its own. Cheapest and most discriminating first: the tag, then the
 * parent's mark — which no capture without a layout engine behind it ever carries,
 * so every library caller stops there — and only then the rest.
 *
 * `role="heading"` is refused for the same reason a heading tag is: an interface
 * built out of divs writes its headings that way, the `##` is what the reader was
 * shown, and handing the content back would take the level with it. The other
 * rule that writes something of its own — one that reads a formula out of a
 * wrapper and ignores what is inside it — is refused in `convert()`, where the
 * rule is already in hand; there the content is deliberately empty, so returning
 * it deletes the formula rather than inlining it.
 */
function inlinedByLine(el: Element, tag: string): boolean {
  if (!LINE_ITEM_TAGS.has(tag)) return false;
  if (!drawnOnOneLine(el.parentNode)) return false;
  if (el.getAttribute?.('role') === 'heading') return false;
  return !holdsABlock(el);
}

/** Whether anything under this element leaves the line it stands on. */
function holdsABlock(el: Element): boolean {
  for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
    if (ENDS_THE_LINE.has(child.tagName.toLowerCase()) || styledBlock(child)) return true;
    if (holdsABlock(child)) return true;
  }
  return false;
}

/**
 * Whether this element's style puts its content on a line of its own, which the
 * sets above cannot say because they are read off the tag.
 *
 * `convert()` writes such an element between blank lines, so it begins a line and
 * ends one exactly as a `<div>` does — and everything that reads the line has to
 * know: a `# heading` the page showed as characters inside a
 * `<span style="display:block">` was left unescaped at the start of a line and
 * became a real H1.
 *
 * The attribute test comes first, and it is the narrow one: this runs per
 * sibling on every lookahead walk, and a `color` on a `<span>` would otherwise
 * pay for a parse of its declarations once per text node that walks past it.
 */
function styledBlock(el: Element): boolean {
  return statesDisplay(el) && displaysAsBlock(el);
}

// How far the lookahead reads. A link label holds no `]`, so the search below stops
// at the first one anyway; this only bounds the pathological case of a very long
// run of text with no bracket in it, where nothing was ever going to be found.
const LOOKAHEAD_LIMIT = 200;

type Lookahead = {
  /** Another string will be joined onto this one, on this line. */
  continues: boolean;
  /** The page's own text in it, as far as it was worth reading. */
  text: string;
  done: boolean;
  /** Whether a tilde still has to be looked for; see `settled`. */
  wantsTilde: boolean;
};

/** Nothing further can change the answer: a `]` with a character after it settles
 * every label still open, and so does a newline, which no label may contain. The
 * tilde question is settled by finding one, since one partner is all it takes. */
function settled(ahead: Lookahead): boolean {
  if (ahead.text.length >= LOOKAHEAD_LIMIT) return true;
  if (ahead.wantsTilde && !ahead.text.includes('~')) return false;
  return /\n|\][\s\S]/.test(ahead.text);
}

/**
 * Text in document order, stopping where the line does.
 *
 * A struck element contributes the `~~` its rule writes, and a code span its
 * backtick, as well as their text. Those are the two delimiters the tilde rule
 * has to see: everything else in the output is either the page's own characters
 * or a mark no tilde can join with. Gathered only when a tilde is being asked
 * about, so the ordinary lookahead still reads the page's text and nothing else.
 */
function absorb(node: Node, ahead: Lookahead): void {
  if (ahead.done) return;
  if (node.nodeType === TEXT_NODE) {
    ahead.text += node.textContent ?? '';
    if (settled(ahead)) ahead.done = true;
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  // A <br> or a nested block ends the line inside a sibling just as it does
  // outside, and so does a style that makes a block out of something else.
  if (tag === 'br' || LINE_ENDS.has(tag) || styledBlock(el)) {
    ahead.done = true;
    return;
  }
  const delimiter = !ahead.wantsTilde ? '' : written(el);
  if (delimiter !== '') {
    ahead.text += delimiter;
    if (settled(ahead)) {
      ahead.done = true;
      return;
    }
  }
  for (const child of Array.from(el.childNodes)) {
    absorb(child, ahead);
    if (ahead.done) return;
  }
  if (delimiter !== '') {
    ahead.text += delimiter;
    if (settled(ahead)) ahead.done = true;
  }
}

/** The delimiter this element's rule writes at each of its two ends, if any. */
function written(el: Element): string {
  if (emitsStrike(el)) return '~~';
  return emitsCodeSpan(el) ? '`' : '';
}

/**
 * What follows this text node on its line: whether anything does, and what it says.
 *
 * The escapers decide per text node, and a text node is not a line: an element
 * between two of them survives `normalize()`, so `&lt;` in a highlighter's span
 * and `img src=…&gt;` in the next span arrive as separate strings that are joined
 * afterwards. Asking here whether there is a next string is what lets the escaper
 * treat an unfinished tail as dangerous — and asking only within the line is what
 * keeps `<h2>Q&amp;A</h2>` free of a backslash it does not need.
 *
 * `continues` is that question, and it says yes for an element sibling whatever its
 * text: an `<img>` holds none and still writes `![alt](…)` into the join. `text` is
 * the narrower question the bracket rule asks — not *whether* something follows but
 * *what* — because a `[` is only markup when a `](` turns up, and escaping every
 * bracket that ends a node would brand every `[1]` on the page.
 */
export function lookAhead(node: Node, wantsText: boolean, wantsTilde = false): Lookahead {
  // Starting `done` is what makes the caller's `wantsText` a real saving: with no
  // text to gather, the walk stops the moment `continues` is answered, which is at
  // the first sibling — the whole of the question this used to ask.
  const ahead: Lookahead = {
    continues: false,
    text: '',
    done: !wantsText && !wantsTilde,
    wantsTilde,
  };
  for (let current: Node | null = node; current; current = current.parentNode) {
    // The same blank, read from the other side. It is added once per boundary
    // and the walk goes on: a tilde looking for its partner further along the
    // line has to keep finding it, and a blank between them does not part them.
    let gapWritten = !laysARow(current.parentNode);
    for (let next = current.nextSibling; next; next = next.nextSibling) {
      if (!gapWritten) {
        ahead.text += ' ';
        gapWritten = true;
      }
      if (next.nodeType === ELEMENT_NODE) {
        // A <br> or a block ends the line here, exactly as it starts one in
        // opensBlock(). Tested before `continues` is set: claiming it first meant
        // `<div>Q&amp;A<h2>x</h2></div>` paid for a backslash the h2 makes
        // unnecessary — the noise this walk exists to avoid.
        const el = next as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'br' || LINE_ENDS.has(tag) || styledBlock(el)) return ahead;
        ahead.continues = true;
      } else if ((next.textContent ?? '') !== '') {
        ahead.continues = true;
      }
      absorb(next, ahead);
      if (ahead.done && ahead.continues) return ahead;
    }
    const parent = current.parentNode;
    if (!parent || parent.nodeType !== ELEMENT_NODE) return ahead;
    const el = parent as Element;
    if (LINE_ENDS.has(el.tagName.toLowerCase()) || styledBlock(el)) return ahead;
  }
  return ahead;
}

/**
 * The tail of what the line writes before this node — the other direction of the
 * same question, and asked only about tildes.
 *
 * The bracket rule needs no such walk: killing either delimiter kills the link,
 * so the node holding the `[` can settle it alone by reading forward. A tilde is
 * not symmetric that way, because one of the two halves may be a delimiter this
 * converter *emits*: `<del>x</del>` writes `~~x~~`, and a `~` in the text after
 * it makes the closing run three long, which is a tilde code fence. The `<del>`
 * rule cannot see the text; the text node has to look back.
 *
 * It stops at the first thing that writes anything, because that is where the
 * seam is — a partner further away is `ahead`'s business on the other side.
 */
function writtenBefore(node: Node): string {
  for (let current: Node | null = node; current; current = current.parentNode) {
    // Between two items of a row the file will carry a blank that the markup
    // does not (`joinRow`), and what stands to the left decides whether an
    // emphasis marker may open at all: asked without it, every tag after the
    // first in a Stack Overflow tag list read as pressed against a word and fell
    // back to `<strong>`, which is live HTML in a Markdown file.
    const inRow = laysARow(current.parentNode);
    for (let prev = current.previousSibling; prev; prev = prev.previousSibling) {
      const tail = writtenTail(prev);
      if (tail !== undefined) return inRow ? ' ' : tail;
    }
    const parent = current.parentNode;
    if (!parent || parent.nodeType !== ELEMENT_NODE) return '';
    const el = parent as Element;
    if (LINE_ENDS.has(el.tagName.toLowerCase()) || styledBlock(el)) return '';
  }
  return '';
}

/** What this node leaves at its end, or undefined when it writes nothing at all. */
function writtenTail(node: Node): string | undefined {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent ?? '';
    return text === '' ? undefined : text;
  }
  if (node.nodeType !== ELEMENT_NODE) return undefined;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  // A line boundary: nothing on the other side of it can reach this node.
  if (tag === 'br' || LINE_ENDS.has(tag) || styledBlock(el)) return '';
  if (emitsStrike(el)) return '~~';
  for (let child = el.lastChild; child; child = child.previousSibling) {
    const tail = writtenTail(child);
    if (tail !== undefined) return tail;
  }
  return undefined;
}

/**
 * Whether this wrapper puts something of its own on the line before its content
 * starts — a delimiter, or the tag an emphasis falls back to.
 *
 * The question `opensBlock` asks on the way up: a text node first inside a
 * `<span>` is at the start of the line the span is on, while one first inside an
 * `<em>` has a `_` in front of it and is not. Escaping there costs a visible
 * backslash rather than a harmless one — `<strong>---</strong>a` falls back to
 * live tags, and Markdown does not unescape inside those.
 */
function writesFirst(el: Element): boolean {
  // A link writes its `[` before the label; `written` covers `~~` and a backtick.
  return el.tagName.toLowerCase() === 'a' || written(el) !== '' || emitsEmphasis(el);
}

function opensBlock(node: Node): boolean {
  // Up through the inline wrappers, not just to the parent: an inline tag draws
  // no line of its own, so a text node first inside one opens whatever line the
  // wrapper opens. ChatGPT writes every run of an answer as its own `<span>`, and
  // asking the `<span>` alone left `<p>…<br><span># решётка</span></p>` — three
  // literal lines the reader saw — with the middle one converted to a real H1,
  // taking the break before it along.
  for (let current: Node = node; ; ) {
    const parent = current.parentElement;
    if (!parent) return false;
    for (let prev = current.previousSibling; prev; prev = prev.previousSibling) {
      // Anything that ends the line before this text leaves it opening one. Only
      // `<br>` was asked about, so `<div>x<hr>## y</div>` and the same with a `<p>`
      // printed the page's literal `## y` as a real heading — the block moved the
      // text to the start of a line and nothing escaped it there.
      if (prev.nodeType === ELEMENT_NODE) {
        const el = prev as Element;
        return ENDS_THE_LINE.has(el.tagName.toLowerCase()) || styledBlock(el);
      }
      if (prev.nodeType !== TEXT_NODE || (prev.textContent ?? '').trim() !== '') return false;
    }
    // Nothing written before it inside this parent, so the parent decides. A
    // style is the second way to be a block, and the parser has to read it here
    // too: `<span style="display:block"># heading</span>` is written between
    // blank lines by `convert()`, so its text starts a line, and while only the
    // tag was asked the page's literal `# heading` arrived as a real H1.
    const tag = parent.tagName.toLowerCase();
    if (BLOCK_PARENTS.has(tag) || styledBlock(parent)) return true;
    // `<body>`/`<html>` hold a capture's top-level blanks and open nothing.
    if (DOCUMENT_WRAPPERS.has(tag) || writesFirst(parent)) return false;
    current = parent;
  }
}

// A run of whitespace and nothing else — the only text node the rule below
// judges. U+00A0 is deliberately outside the class: `sanitize()` leaves a
// non-breaking space alone because a browser draws one, and `trim()` would have
// taken it for a blank and thrown away a character the reader saw.
const BLANK_RUN = /^[\t\n\v\f\r ]+$/;

// The wrappers that hold a page's whole text and are named in none of the sets
// above, because no escaper ever had to name them: nothing is written before a
// `<body>` begins, and `<head>` — the only thing beside it — draws nothing at
// all. `opensBlock()` stops short of them as well, and answers `false` for a
// text node whose parent is one, which is exactly where a capture leaves the
// blanks between a page's top-level blocks.
const DOCUMENT_WRAPPERS = new Set(['body', 'html']);

/**
 * Whether this element's style keeps its content on the line its tag would have
 * left — the mirror of `styledBlock`, gated the same cheap way round.
 */
function inlinedBlock(el: Element): boolean {
  return statesDisplay(el) && displaysInline(el);
}

/**
 * Whether this element leaves the line it stands on, as `convert()` really
 * writes it.
 *
 * `ENDS_THE_LINE` reads the tag alone, and for an escaper that is the safe
 * direction: over-reading a boundary there costs a backslash. Here it would cost
 * a word. A block declaring `display:inline` returns its content instead of
 * running its rule, so two `<p style="display:inline">` are one sentence on the
 * page and one line in the file — calling the first of them a line end would
 * take the blank between them and weld `Yes No` into `YesNo`.
 */
function endsTheLine(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  // Asked before the style, because a measured line is the later word about the
  // same thing: an item of such a container is written as its content, so it
  // leaves no more of a boundary behind it than a `<span>` does.
  if (inlinedByLine(el, tag)) return false;
  if (styledBlock(el)) return true;
  if (declinesBlock(el, tag)) return false;
  return ENDS_THE_LINE.has(tag);
}

/**
 * Whether a block tag's `display:inline` really takes its block away.
 *
 * For most of `INLINEABLE_BLOCKS` the declaration settles it. A heading is the
 * exception, because `inline` is how a skin puts something *beside* the title
 * rather than how it stops being one: Wikipedia's Vector 2022 wraps every `<h2>`
 * in a `<div class="mw-heading">` and inlines the heading so the `[edit]` link
 * lands on its line — and the reader still met a line of large type. Taking the
 * declaration at its word cost a 1,100-line article every one of its 60 section
 * headings; they arrived as prose, and the `<h3>`s as `**bold**`, since bold is
 * all a heading's weight leaves once the level is gone.
 *
 * What is left is the case the declaration is really for: a heading with text
 * written before it on its own line, `<div>x<h2 style="display:inline">a</h2>y`,
 * where a `##` would break a sentence in two. So the question is not what the
 * style says but whether anything drew before it — the tag carries a level no
 * `display` can spell, and a heading that opens its line kept one.
 */
function declinesBlock(el: Element, tag: string): boolean {
  if (!INLINEABLE_BLOCKS.has(tag) || !inlinedBlock(el)) return false;
  return !HEADING_TAGS.has(tag) || !atLineEdge(el, 'previousSibling');
}

/** The same question about a container: whether its edge is the line's edge. */
function boundsTheLine(el: Element): boolean {
  return endsTheLine(el) || DOCUMENT_WRAPPERS.has(el.tagName.toLowerCase());
}

/**
 * Whether nothing that draws stands between this node and one edge of its line.
 *
 * Both directions are the same walk, and the same shape `lookAhead()` and
 * `writtenBefore()` use: along the siblings on that side, then out through every
 * container that does not itself bound the line. A comment is stepped over, and
 * so is another blank — neither draws anything, and a run of them between two
 * blocks is what an ad slot, a template engine or a CMS leaves behind.
 */
function atLineEdge(node: Node, side: 'previousSibling' | 'nextSibling'): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    for (let sibling = current[side]; sibling; sibling = sibling[side]) {
      if (sibling.nodeType === ELEMENT_NODE) return endsTheLine(sibling as Element);
      const text = sibling.nodeType === TEXT_NODE ? (sibling.textContent ?? '') : '';
      if (text !== '' && !BLANK_RUN.test(text)) return false;
    }
    const parent = current.parentNode;
    // A Document, or the fragment a selection builds: there is no more document
    // on this side, so the line begins or ends right here.
    if (!parent || parent.nodeType !== ELEMENT_NODE) return true;
    if (boundsTheLine(parent as Element)) return true;
  }
  return true;
}

/**
 * Whether a whitespace-only node stands where the browser drew nothing.
 *
 * The newline and the indentation between a `</p>` and the tag after it are not
 * a space on screen — a block ended, so the run begins a line and none of it is
 * painted. `sanitize()` cannot tell that seam from the one between two words: it
 * collapses every run to a single space before anything knows what stands around
 * it, and the space then reaches the file at the start of a line.
 *
 * The rule is drawn at the line's two edges and nowhere between them. A blank in
 * the middle separates two runs the reader saw side by side, and taking it welds
 * them into one word — `<span>a</span> <span>b</span>` is `a b`, not `ab`. At an
 * edge it separates nothing, and it is more than noise there: four such blanks
 * in a row are an indented code block, so a paragraph the page showed as prose
 * reaches the reader as a code listing.
 */
function drawsNothing(node: Node, text: string): boolean {
  if (!BLANK_RUN.test(text)) return false;
  return atLineEdge(node, 'previousSibling') || atLineEdge(node, 'nextSibling');
}

// The blank a seam can fold away, spelled from the same class as `BLANK_RUN` and
// for the same reason: U+00A0 is a character the page chose rather than layout,
// and a browser draws one wherever it stands. It becomes an ordinary space in
// `normalize()`, at the end, and never by being folded into a neighbour.
const LEADING_BLANK = /^[\t\n\v\f\r ]+/;

/** What the line holds where a node ends: a blank another blank folds into,
 * something that is not one, or no character at all — which is what lets the
 * walk below step over a node and go on looking. */
type Trailing = 'blank' | 'other' | 'nothing';

/**
 * The wrappers a blank can be read *out of* — the ones whose whole output is
 * their content, so a blank the content ends in is still the last character on
 * the line once the element is written.
 *
 * Emphasis belongs here because its delimiters go *inside* the whitespace it
 * lifts out: `<b>a </b>` is `**a** `, and `<em>`, `<del>` and a style saying the
 * same thing all emit through the one function that does it. The rest are the
 * plain inline wrappers no rule claims, `<span>` being the whole of the case in
 * practice.
 *
 * An allowlist, and that is the point: everything absent answers `other`, which
 * loses a collapse and can never weld. A code span rewrites the text it holds —
 * it takes the spans behind it, folds newlines and pads against backticks — an
 * image has no content at all and a `<sup>` shifts every character it has, so a
 * blank read out of one of those is a character that may not be where it stood.
 */
const HANDS_CONTENT_BACK = new Set([
  'span', 'font', 'mark', 'ins', 'u', 'small', 'big', 'abbr', 'cite', 'time', 'label', 'bdi', 'bdo',
  'strong', 'b', 'em', 'i', 'del', 's',
]);

/** What this node leaves at its end, as the file really receives it. */
function trailingWritten(node: Node): Trailing {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent ?? '';
    // A node that writes no character is one the seam cannot see: an empty one,
    // and a blank at a line's edge, which `drawsNothing()` has already dropped.
    if (text === '' || drawsNothing(node, text)) return 'nothing';
    return BLANK_RUN.test(text.slice(-1)) ? 'blank' : 'other';
  }
  if (node.nodeType !== ELEMENT_NODE) return 'nothing';
  const el = node as Element;
  // The line ends here, so what follows opens one and has no neighbour to fold
  // into: a blank there is `drawsNothing()`'s question rather than this one.
  if (endsTheLine(el)) return 'other';
  const tag = el.tagName.toLowerCase();
  // A block that declined the block its tag implies returns its content and
  // writes nothing else; `endsTheLine()` has answered for the ones that kept it.
  if (!INLINEABLE_BLOCKS.has(tag) && !HANDS_CONTENT_BACK.has(tag)) return 'other';
  for (let child = el.lastChild; child; child = child.previousSibling) {
    const trailing = trailingWritten(child);
    if (trailing !== 'nothing') return trailing;
  }
  return 'nothing';
}

/**
 * Whether the line has already written a collapsible blank where this node
 * begins.
 *
 * The walk is `atLineEdge()`'s, not `writtenBefore()`'s, and the difference is
 * the whole of this defect. `writtenBefore()` is the escaper's instrument: it
 * reads the boundary off the tag, so it stops dead at a
 * `<div style="display:inline">` — the very element the seam crosses — and it
 * reports a node's raw text, so a blank `drawsNothing()` has thrown away still
 * reads as a written space. Over-reading a boundary costs a backslash there; it
 * would cost a word here. So the boundary is `endsTheLine()`, which reads the
 * display the page declared, and each node is asked what it really writes.
 */
function blankBefore(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    for (let prev = current.previousSibling; prev; prev = prev.previousSibling) {
      const trailing = trailingWritten(prev);
      if (trailing !== 'nothing') return trailing === 'blank';
    }
    const parent = current.parentNode;
    if (!parent || parent.nodeType !== ELEMENT_NODE) return false;
    if (boundsTheLine(parent as Element)) return false;
  }
  return false;
}

/**
 * This text node's own text, with a leading blank taken off where the line has
 * already written one.
 *
 * Two collapsible runs that meet across an element boundary are one space on
 * screen: the newline and the indentation between `</div>` and the next tag
 * collapse to one, the run the next element opens with is another, and a browser
 * folds the pair. Both reached the file, and the Source pane is where a person
 * sees them — the rendered half hides it, since two spaces render as one.
 *
 * Only the second run goes. Dropping the seam altogether would weld
 * `<p style="display:inline">Yes</p> <p style="display:inline">No</p>` into
 * `YesNo`, which is why the repair at a line's *edge* stopped short of this one;
 * one space must survive, and one does. That also keeps the flanking tests
 * honest, because they ask whether there is whitespace beside a run and there
 * still is.
 *
 * Asked of the page's own text and nowhere else. The same fold applied to the
 * finished document would eat a pipe table's column padding and the indentation
 * `preInCell` writes, which are the converter's characters, not the page's.
 */
function foldedIntoSeam(node: Node, text: string): string {
  if (!LEADING_BLANK.test(text)) return text;
  return blankBefore(node) ? text.replace(LEADING_BLANK, '') : text;
}

/** True while writing into an HTML block, where Markdown is not parsed. */
export function isHtmlContext(options: MarkItDownOptions): boolean {
  return options.outputContext === 'html' || options.escapeSyntax === false;
}

function literalContext(node: Node): 'none' | 'code' | 'math' {
  let el = node.parentElement;
  while (el) {
    const tag = el.tagName.toLowerCase();
    if (LITERAL_TAGS.has(tag)) return 'code';
    if (MATH_TAGS.has(tag) || el.classList?.contains('katex')) return 'math';
    el = el.parentElement;
  }
  return 'none';
}

/**
 * Whether this element's content is characters rather than markup.
 *
 * Code and maths are the two places where a style has nothing worth writing
 * down: a `**` inside a fence or a code span is two characters of the sample,
 * and inside a formula two more tokens of LaTeX. A syntax highlighter puts a
 * `<span style="font-weight:bold">` on every other keyword, and every one of
 * them would land in the code.
 *
 * `literalContext` answers for the ancestors; the element's own tag is asked
 * here, because an element is inside itself.
 */
function inLiteral(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (LITERAL_TAGS.has(tag) || MATH_TAGS.has(tag) || el.classList?.contains('katex')) return true;
  return literalContext(el) !== 'none';
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export function convert(node: Node, options: MarkItDownOptions): string {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent ?? '';
    // Markdown the page showed as characters must render as characters — unless
    // this text is headed for an HTML block, where Markdown does not apply.
    if (isHtmlContext(options)) return text;
    const literal = literalContext(node);
    // A fence or a code span already makes code inert; LaTeX does not, so only
    // what could open a tag is neutralized there.
    if (literal === 'code') return text;
    // Whitespace the browser painted nowhere is nothing in the file either.
    if (drawsNothing(node, text)) return '';
    // Every escaper judges a construct by what follows it, and none can see past
    // the end of this node — so they are told what does. Only the bracket and
    // tilde rules read the text itself, so a node neither has a use for skips
    // gathering it, which is almost every node on almost every page.
    const prose = literal === 'none';
    const wantsTilde = prose && text.includes('~');
    const ahead = lookAhead(node, prose && mayOpenLink(text), wantsTilde);
    if (literal === 'math') return escapeMathTags(text, ahead.continues);
    // Whitespace collapses across an element boundary as it does inside one, so
    // a run meeting the blank the line already ends in adds nothing. Below the
    // literal returns above, because inside a fence, a code span or a formula
    // every character is content.
    const own = foldedIntoSeam(node, text);
    const seam = { behind: wantsTilde ? writtenBefore(node) : '', ahead: ahead.text };
    // HTML escaping comes after the Markdown pass, which doubles backslashes: run
    // the other way round and the `\<` this adds would be doubled into a literal.
    const escaped = escapeHtmlSyntax(escapeInlineMarkdown(own, seam), ahead.continues);
    return opensBlock(node) ? escapeBlockStarts(escaped) : escaped;
  }
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const rule = findRule(el, options);
    const childContent = rule.ignoresChildContent ? '' : convertChildren(el, options);
    // A rule that never converted its children has nothing for a line to take
    // back: `.katex` and `.mwe-math-element` are ordinary `<div>`s holding a
    // formula their rule reads off the element, and handing back the empty
    // content would delete it. The rule writes what it writes, block and all.
    const inLine = !rule.ignoresChildContent && inlinedByLine(el, tag);
    // The two things a style says that no rule can read off a tag: that this run
    // is emphasised, and which line its content stands on. The marks go inside
    // whatever the rule writes and the line is decided outside it, so a styled
    // block keeps being a block and a styled `<span>` keeps its place in the
    // sentence.
    //
    // The gate is what the style *says*, not that there is one: a `color` or a
    // `margin` — most of what a page writes inline — cannot change a character of
    // the output, and asking for presence charged every one of them the ancestor
    // walk below plus a parse of its declarations.
    const styled = statesConversion(el) && !inLiteral(el);
    if (!styled) {
      // The one blockness question a wrapper with no style of its own can have:
      // the container around it was measured as one line, and a block here would
      // break a sentence the reader read in one.
      return inLine ? childContent : rule.replacement(el, childContent, options);
    }
    const content = applyStyleEmphasis(el, childContent, options);
    // Declining the block the tag implies, which is the mirror of adding one. It
    // is decided here rather than in each rule because every block tag has the
    // question and only `<div>` was answering it, while the snapshot records the
    // declaration for all of them: two `<p style="display:inline">` were two
    // paragraphs in the file and one sentence on the page.
    if (declinesBlock(el, tag) || inLine) return content;
    const out = rule.replacement(el, content, options);
    if (!displaysAsBlock(el)) return out;
    const trimmed = out.trim();
    return trimmed === '' ? out : `\n\n${trimmed}\n\n`;
  }
  return '';
}

export function convertChildren(el: Element | Document, options: MarkItDownOptions): string {
  const parts = Array.from(el.childNodes).map((child) => convert(child, options));
  // A Document has no `getAttribute` at all, and answers `undefined` here.
  return laysARow(el as Node) ? joinRow(parts) : parts.join('');
}

/**
 * One blank between boxes that stood apart on screen, and never a second one:
 * whatever already ends or starts in whitespace has its gap.
 */
function joinRow(parts: string[]): string {
  let out = '';
  for (const part of parts) {
    if (part === '') continue;
    if (out !== '' && !/\s$/.test(out) && !/^\s/.test(part)) out += ' ';
    out += part;
  }
  return out;
}
