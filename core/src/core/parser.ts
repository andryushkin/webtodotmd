import type { MarkItDownOptions } from '../types.js';
import { findRule } from './rules.js';
import { applyStyleEmphasis, emitsCodeSpan } from '../rules/inline.js';
import {
  displaysAsBlock,
  displaysInline,
  statesConversion,
  statesDisplay,
} from '../utils/inline-style.js';
import { emitsStrike } from '../utils/flanking.js';
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
const LINE_ENDS = new Set([...BLOCK_PARENTS, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre']);

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
const INLINEABLE_BLOCKS = new Set([...BLOCK_PARENTS, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

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
    for (let next = current.nextSibling; next; next = next.nextSibling) {
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
    for (let prev = current.previousSibling; prev; prev = prev.previousSibling) {
      const tail = writtenTail(prev);
      if (tail !== undefined) return tail;
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

function opensBlock(node: Node): boolean {
  const parent = node.parentElement;
  // A style is the second way to be a block, and the parser has to read it here
  // too: `<span style="display:block"># heading</span>` is written between blank
  // lines by `convert()`, so its text starts a line, and while only the tag was
  // asked about the page's literal `# heading` arrived as a real H1.
  if (!parent) return false;
  if (!BLOCK_PARENTS.has(parent.tagName.toLowerCase()) && !styledBlock(parent)) return false;
  for (let prev = node.previousSibling; prev; prev = prev.previousSibling) {
    // Anything that ends the line before this text leaves it opening one. Only
    // `<br>` was asked about, so `<div>x<hr>## y</div>` and the same with a `<p>`
    // printed the page's literal `## y` as a real heading — the block moved the
    // text to the start of a line and nothing escaped it there.
    if (prev.nodeType === ELEMENT_NODE) {
      const el = prev as Element;
      if (ENDS_THE_LINE.has(el.tagName.toLowerCase()) || styledBlock(el)) return true;
      return false;
    }
    if (prev.nodeType !== TEXT_NODE || (prev.textContent ?? '').trim() !== '') return false;
  }
  return true;
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
  if (styledBlock(el)) return true;
  const tag = el.tagName.toLowerCase();
  if (INLINEABLE_BLOCKS.has(tag) && inlinedBlock(el)) return false;
  return ENDS_THE_LINE.has(tag);
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
    const seam = { behind: wantsTilde ? writtenBefore(node) : '', ahead: ahead.text };
    // HTML escaping comes after the Markdown pass, which doubles backslashes: run
    // the other way round and the `\<` this adds would be doubled into a literal.
    const escaped = escapeHtmlSyntax(escapeInlineMarkdown(text, seam), ahead.continues);
    return opensBlock(node) ? escapeBlockStarts(escaped) : escaped;
  }
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const rule = findRule(el, options);
    const childContent = rule.ignoresChildContent ? '' : convertChildren(el, options);
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
    if (!styled) return rule.replacement(el, childContent, options);
    const content = applyStyleEmphasis(el, childContent, options);
    // Declining the block the tag implies, which is the mirror of adding one. It
    // is decided here rather than in each rule because every block tag has the
    // question and only `<div>` was answering it, while the snapshot records the
    // declaration for all of them: two `<p style="display:inline">` were two
    // paragraphs in the file and one sentence on the page.
    if (INLINEABLE_BLOCKS.has(tag) && displaysInline(el)) return content;
    const out = rule.replacement(el, content, options);
    if (!displaysAsBlock(el)) return out;
    const trimmed = out.trim();
    return trimmed === '' ? out : `\n\n${trimmed}\n\n`;
  }
  return '';
}

export function convertChildren(el: Element | Document, options: MarkItDownOptions): string {
  return Array.from(el.childNodes)
    .map((child) => convert(child, options))
    .join('');
}
