import type { MarkItDownOptions } from '../types.js';
import { findRule } from './rules.js';
import { applyStyleEmphasis } from '../rules/inline.js';
import { displaysAsBlock, hasStyle } from '../utils/inline-style.js';
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
};

/** Nothing further can change the answer: a `]` with a character after it settles
 * every label still open, and so does a newline, which no label may contain. */
function settled(text: string): boolean {
  return text.length >= LOOKAHEAD_LIMIT || /\n|\][\s\S]/.test(text);
}

/** Text in document order, stopping where the line does. */
function absorb(node: Node, ahead: Lookahead): void {
  if (ahead.done) return;
  if (node.nodeType === TEXT_NODE) {
    ahead.text += node.textContent ?? '';
    if (settled(ahead.text)) ahead.done = true;
    return;
  }
  if (node.nodeType !== ELEMENT_NODE) return;
  const tag = (node as Element).tagName.toLowerCase();
  // A <br> or a nested block ends the line inside a sibling just as it does outside.
  if (tag === 'br' || LINE_ENDS.has(tag)) {
    ahead.done = true;
    return;
  }
  for (const child of Array.from(node.childNodes)) {
    absorb(child, ahead);
    if (ahead.done) return;
  }
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
export function lookAhead(node: Node, wantsText: boolean): Lookahead {
  // Starting `done` is what makes the caller's `wantsText` a real saving: with no
  // text to gather, the walk stops the moment `continues` is answered, which is at
  // the first sibling — the whole of the question this used to ask.
  const ahead: Lookahead = { continues: false, text: '', done: !wantsText };
  for (let current: Node | null = node; current; current = current.parentNode) {
    for (let next = current.nextSibling; next; next = next.nextSibling) {
      if (next.nodeType === ELEMENT_NODE) {
        // A <br> or a block ends the line here, exactly as it starts one in
        // opensBlock(). Tested before `continues` is set: claiming it first meant
        // `<div>Q&amp;A<h2>x</h2></div>` paid for a backslash the h2 makes
        // unnecessary — the noise this walk exists to avoid.
        const tag = (next as Element).tagName.toLowerCase();
        if (tag === 'br' || LINE_ENDS.has(tag)) return ahead;
        ahead.continues = true;
      } else if ((next.textContent ?? '') !== '') {
        ahead.continues = true;
      }
      absorb(next, ahead);
      if (ahead.done && ahead.continues) return ahead;
    }
    const parent = current.parentNode;
    if (!parent || parent.nodeType !== ELEMENT_NODE) return ahead;
    if (LINE_ENDS.has((parent as Element).tagName.toLowerCase())) return ahead;
  }
  return ahead;
}

function opensBlock(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent || !BLOCK_PARENTS.has(parent.tagName.toLowerCase())) return false;
  for (let prev = node.previousSibling; prev; prev = prev.previousSibling) {
    // Anything that ends the line before this text leaves it opening one. Only
    // `<br>` was asked about, so `<div>x<hr>## y</div>` and the same with a `<p>`
    // printed the page's literal `## y` as a real heading — the block moved the
    // text to the start of a line and nothing escaped it there.
    if (prev.nodeType === ELEMENT_NODE && ENDS_THE_LINE.has((prev as Element).tagName.toLowerCase())) {
      return true;
    }
    if (prev.nodeType !== TEXT_NODE || (prev.textContent ?? '').trim() !== '') return false;
  }
  return true;
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
    // Every escaper judges a construct by what follows it, and none can see past
    // the end of this node — so they are told what does. Only the bracket rule
    // reads the text itself, so a node it has no use for skips gathering it.
    const ahead = lookAhead(node, literal === 'none' && mayOpenLink(text));
    if (literal === 'math') return escapeMathTags(text, ahead.continues);
    // HTML escaping comes after the Markdown pass, which doubles backslashes: run
    // the other way round and the `\<` this adds would be doubled into a literal.
    const escaped = escapeHtmlSyntax(escapeInlineMarkdown(text, ahead.text), ahead.continues);
    return opensBlock(node) ? escapeBlockStarts(escaped) : escaped;
  }
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    const rule = findRule(el, options);
    const childContent = rule.ignoresChildContent ? '' : convertChildren(el, options);
    // The two things a style says that no rule can read off a tag: that this run
    // is emphasised, and that it stands on a line of its own. The marks go inside
    // whatever the rule writes and the break goes outside it, so a styled block
    // keeps being a block and a styled `<span>` keeps its place in the sentence.
    //
    // The attributes are asked for first because almost no element carries one,
    // and `inLiteral` walks the ancestry: without this the whole tree paid for its
    // own depth on every document, styled or not.
    const styled = hasStyle(el) && !inLiteral(el);
    if (!styled) return rule.replacement(el, childContent, options);
    const out = rule.replacement(el, applyStyleEmphasis(el, childContent, options), options);
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
