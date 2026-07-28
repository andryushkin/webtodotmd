import type { MarkItDownOptions } from '../types.js';

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
  return ariaLevel(el);
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
