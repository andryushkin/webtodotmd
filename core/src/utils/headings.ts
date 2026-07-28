import type { MarkItDownOptions } from '../types.js';
import {
  displaysAsBlock,
  displaysInline,
  drawnApart,
  isBlockTag,
  statesDisplay,
} from './inline-style.js';

/**
 * The shallowest heading under `root`, or `null` where there is none.
 *
 * Asked *after* `sanitize()` and never before: an `.sr-only` "Navigation" `<h2>`
 * is a heading nobody saw, and letting it set the base pushes every heading the
 * reader did see one level deeper. Which headings are unseen is the sanitizer's
 * question — by the time this runs it has already answered it by removing them,
 * so the rule is not spelled a second time here.
 */
export function minHeadingLevel(root: ParentNode): number | null {
  const headings = Array.from(root.querySelectorAll?.(HEADINGS) ?? []);
  let min: number | null = null;
  for (const el of headings) {
    const level = levelOf(el);
    if (level !== null && (min === null || level < min)) min = level;
  }
  return min;
}

// A heading is a tag or a role — see the `aria-heading` rule for why the second
// counts. Both are asked here, or a document whose headings are all `role`s
// would normalize against nothing and keep the levels the rule wrote.
const HEADINGS = 'h1,h2,h3,h4,h5,h6,[role="heading"]';

function levelOf(el: Element): number | null {
  const tag = el.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return Number(tag[1]);
  // The same question the rule asks, and it has to be the same one: a role the
  // rule writes as a paragraph must not set the level every real heading on the
  // page is then normalized against.
  return writtenAsHeading(el) ? ariaLevel(el) : null;
}

/** What a browser reports for a `role="heading"` that states no level. */
export const ARIA_DEFAULT_LEVEL = 2;

/**
 * The level a `role="heading"` is written at, in the range Markdown can spell.
 *
 * Two different silences used to share one answer. A heading that states no
 * level is announced as a 2, and that is what `ARIA_DEFAULT_LEVEL` is for. A
 * heading that states `aria-level="9"` has stated one: ARIA puts a floor of 1 on
 * the attribute and no ceiling at all, so a browser reports 9 and the reader met
 * a subsection — falling back on 2 there wrote the child *above* its own parent,
 * `### Parent` over `## Child`. A tag never does that: `h1`–`h6` shifted past the
 * bottom are clamped, and this is the same clamp over a level the page spelled
 * itself. Below 1 is not a level at all, so it falls in with the silent ones.
 *
 * Read here and by the `aria-heading` rule, never spelled twice: one of them
 * writes the `#` and the other decides what `topHeadingLevel` shifts against, and
 * two answers would have a heading normalized against a level nothing wrote.
 */
export function ariaLevel(el: Element): number {
  const stated = Number(el.getAttribute('aria-level'));
  return Number.isInteger(stated) && stated >= 1 ? Math.min(stated, 6) : ARIA_DEFAULT_LEVEL;
}

/**
 * Whether an element claiming the heading role was written as one.
 *
 * `h1`–`h6` need no such question: the browser draws the heading itself, so what
 * the tag states and what the reader met cannot come apart. A `<div>` is drawn
 * like everything else on the page, which makes the role a claim about meaning
 * and the drawing the only evidence for it — and the rule used to take the claim
 * on its own. The spec page shows what that costs: six identical lines, one size,
 * one weight, no hierarchy anywhere on screen, and four headings in the file.
 *
 * Three things have to agree, and each answers a way of being wrong:
 *
 * - It draws a line of its own. A role hung on something inside a sentence is a
 *   label, and a `##` would cut the sentence in two.
 * - It holds no block of its own. A role hung on the wrapper of a whole section
 *   either drags the section onto the heading's line or nests a heading inside a
 *   heading; neither is what the page showed.
 * - It was drawn apart from the text around it — `drawnApart`.
 *
 * The third can only be asked where somebody wrote the drawing down. A library
 * caller has no snapshot at all, and there silence means the question was never
 * put rather than answered "no", so the role stands exactly as it did before —
 * which is what the `undefined` of `drawnApart` says, and why it is read as a
 * yes here.
 *
 * Wrong either way this costs structure and never a word: a demoted heading
 * arrives as a paragraph with all of its text, and a promoted paragraph gets a
 * `##` in front of it. That is why all three are required rather than any of
 * them — the strict reading has no way to delete anything.
 */
export function writtenAsHeading(el: Element): boolean {
  return drawsALine(el) && !holdsABlock(el) && (drawnApart(el) ?? true);
}

/**
 * Whether this element takes a line of its own — the tag's answer, unless a
 * style overrides it in either direction.
 *
 * A `<div style="display:inline">` never reaches the rule at all: `convert()`
 * hands back its content before any rule runs. A `<span>` does reach it, and
 * inline is what a `<span>` is, so the same question has to be asked here or a
 * `role="heading"` on one puts a `##` in the middle of a paragraph.
 */
function drawsALine(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (isBlockTag(tag)) return !displaysInline(el);
  return statesDisplay(el) && displaysAsBlock(el);
}

/**
 * Whether anything under this element draws a line of its own.
 *
 * A heading is a line, so a role covering blocks is covering a section. `<br>` is
 * out of the count deliberately: it draws a second line *of the heading* rather
 * than a block under it, and the tags do the same thing — `<h2>a<br>b</h2>` has
 * always been written as one heading.
 */
function holdsABlock(el: Element): boolean {
  for (let child = el.firstElementChild; child; child = child.nextElementSibling) {
    const tag = child.tagName.toLowerCase();
    if (tag !== 'br' && isBlockTag(tag)) return true;
    if (statesDisplay(child) && displaysAsBlock(child)) return true;
    if (holdsABlock(child)) return true;
  }
  return false;
}

/**
 * The shift that raises the shallowest heading to `topLevel`, or 0 where the
 * input has no heading at all — a shift of nothing is what a document without
 * headings asks for, in either direction.
 *
 * Only upwards. A capture whose top heading is already `<h1>` keeps it: an H1 is
 * the rank the page gave its title, and pushing it to `##` to keep `#` free
 * spends the reader's structure on the note's own formatting. Deeper input is
 * still pulled up, which is what the shift is for — a chat answer written under
 * `<h3>` becomes `##` and not `####`.
 */
export function headingOffsetTo(root: ParentNode, topLevel: number): number {
  const min = minHeadingLevel(root);
  return min === null ? 0 : Math.min(0, topLevel - min);
}

/** Fills in `headingOffset` from `topHeadingLevel`, once the root is sanitized. */
export function resolveHeadingOffset(
  root: ParentNode,
  options: MarkItDownOptions,
): MarkItDownOptions {
  if (options.headingOffset !== undefined || options.topHeadingLevel === undefined) return options;
  return { ...options, headingOffset: headingOffsetTo(root, options.topHeadingLevel) };
}
