import type { Rule, MarkItDownOptions } from '../types.js';
import { convert } from '../core/parser.js';
import { displaysInline } from '../utils/inline-style.js';

const ELEMENT_NODE = 1;
const ANCHOR_CLASSES = new Set(['anchor', 'heading-link', 'headerlink']);

function isHeadingAnchor(el: Element): boolean {
  if (el.tagName.toLowerCase() !== 'a') return false;
  const cls = el.getAttribute('class') ?? '';
  return cls.split(/\s+/).some((c) => ANCHOR_CLASSES.has(c));
}

function getHeadingText(el: Element, options: MarkItDownOptions): string {
  let text = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === ELEMENT_NODE && isHeadingAnchor(child as Element)) continue;
    text += convert(child, options);
  }
  return text.trim();
}

function prefixBlockquote(text: string): string {
  // A line of spaces is a blank line to the reader but not to the collapse below,
  // and HTML indentation between a </p> and the <ul> after it produces several —
  // which came out as a run of bare `>` lines inside the quote.
  const normalized = text.replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  return normalized
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

export const BLOCK_RULES: Rule[] = [
  {
    name: 'heading',
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    replacement(el, _childContent, options) {
      const text = getHeadingText(el, options);
      if (!text) return '';
      const rawLevel = Number(el.tagName[1]);
      const level = Math.min(Math.max(rawLevel + (options.headingOffset ?? 0), 1), 6);
      return `\n\n${'#'.repeat(level)} ${text}\n\n`;
    },
  },
  {
    name: 'paragraph',
    filter: ['p'],
    replacement(_el, childContent) {
      const text = childContent.trim();
      if (!text) return '';
      return `\n\n${text}\n\n`;
    },
  },
  {
    name: 'break',
    filter: ['br'],
    replacement: () => '\\\n',
  },
  {
    name: 'hr',
    filter: ['hr'],
    replacement: () => '\n\n---\n\n',
  },
  {
    name: 'blockquote',
    filter: ['blockquote'],
    replacement(_el, childContent) {
      const trimmed = childContent.trim();
      if (!trimmed) return '';
      return `\n\n${prefixBlockquote(trimmed)}\n\n`;
    },
  },
  {
    name: 'div',
    filter: ['div'],
    replacement(el, childContent) {
      const text = childContent.trim();
      if (!text) return '';
      // `display: inline` on a `<div>` is how a page puts a wrapper — a tooltip
      // host, a highlighter's span written as a div — inside a sentence. Writing
      // the paragraph the tag implies would cut that sentence in two, and the
      // reader saw one. Untrimmed on purpose: an inline box keeps the spaces
      // around it, and they are what separate it from the words on either side.
      return displaysInline(el) ? childContent : `\n\n${text}\n\n`;
    },
  },
  // Markdown has no definition list, so a <dl> becomes what the page showed: the
  // term on a line of its own and the definition on the next, each its own
  // block. Before this rule existed the three tags fell through to the default,
  // which returns its children's text unchanged, and `<dt>aa</dt><dd>bb</dd>`
  // arrived as `aabb` — the page showed two lines and the reader got one word.
  //
  // Every other candidate writes a marker the page never showed. `aa` over
  // `:   bb` is Pandoc's syntax and not CommonMark's: there the second line is a
  // lazy continuation of the first, so the pair welds back into one line and
  // gains a stray colon on the way. A bold term invents emphasis. Indenting the
  // definition is the shape a browser renders, but an indent under four spaces
  // renders as nothing at all, so it would buy the source a cue at the price of
  // changing how a list or a fence inside the definition is parsed. A blank line
  // is the one separator that costs nothing.
  //
  // What it does not carry is which definition belongs to which term when a list
  // has several pairs; adjacency is all that is left of that, and Markdown
  // offers nothing better without inventing syntax.
  {
    name: 'definition-list',
    filter: ['dl', 'dt', 'dd'],
    replacement(_el, childContent) {
      const text = childContent.trim();
      if (!text) return '';
      return `\n\n${text}\n\n`;
    },
  },
];
