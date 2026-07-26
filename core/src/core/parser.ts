import type { MarkItDownOptions } from '../types.js';
import { findRule } from './rules.js';
import {
  escapeBlockStarts,
  escapeHtmlSyntax,
  escapeInlineMarkdown,
  escapeMathTags,
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

/**
 * True when another node's text will be appended to this one's on the same line.
 *
 * The escapers decide per text node, and a text node is not a line: an element
 * between two of them survives `normalize()`, so `&lt;` in a highlighter's span
 * and `img src=…&gt;` in the next span arrive as separate strings that are joined
 * afterwards. Asking here whether there is a next string is what lets the escaper
 * treat an unfinished tail as dangerous — and asking only within the line is what
 * keeps `<h2>Q&amp;A</h2>` free of a backslash it does not need.
 */
function continuesOnLine(node: Node): boolean {
  for (let current: Node | null = node; current; current = current.parentNode) {
    for (let next = current.nextSibling; next; next = next.nextSibling) {
      if (next.nodeType === ELEMENT_NODE) {
        // A <br> ends the line here, exactly as it starts one in opensBlock().
        if ((next as Element).tagName.toLowerCase() === 'br') return false;
        return true;
      }
      if ((next.textContent ?? '') !== '') return true;
    }
    const parent = current.parentNode;
    if (!parent || parent.nodeType !== ELEMENT_NODE) return false;
    if (LINE_ENDS.has((parent as Element).tagName.toLowerCase())) return false;
  }
  return false;
}

function opensBlock(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent || !BLOCK_PARENTS.has(parent.tagName.toLowerCase())) return false;
  for (let prev = node.previousSibling; prev; prev = prev.previousSibling) {
    // A <br> ends the line before it, so what follows starts one.
    if (prev.nodeType === ELEMENT_NODE && (prev as Element).tagName.toLowerCase() === 'br') {
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
    // Both escapers judge a construct by what follows it, and neither can see
    // past the end of this node — so they are told whether anything follows.
    const continues = continuesOnLine(node);
    if (literal === 'math') return escapeMathTags(text, continues);
    // HTML escaping comes after the Markdown pass, which doubles backslashes: run
    // the other way round and the `\<` this adds would be doubled into a literal.
    const escaped = escapeHtmlSyntax(escapeInlineMarkdown(text), continues);
    return opensBlock(node) ? escapeBlockStarts(escaped) : escaped;
  }
  if (node.nodeType === ELEMENT_NODE) {
    const el = node as Element;
    const rule = findRule(el, options);
    const childContent = rule.ignoresChildContent ? '' : convertChildren(el, options);
    return rule.replacement(el, childContent, options);
  }
  return '';
}

export function convertChildren(el: Element | Document, options: MarkItDownOptions): string {
  return Array.from(el.childNodes)
    .map((child) => convert(child, options))
    .join('');
}
