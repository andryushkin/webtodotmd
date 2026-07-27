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
  const headings = Array.from(root.querySelectorAll?.('h1,h2,h3,h4,h5,h6') ?? []);
  let min: number | null = null;
  for (const el of headings) {
    const level = Number(el.tagName[1]);
    if (min === null || level < min) min = level;
  }
  return min;
}

/**
 * The shift that puts the shallowest heading at `topLevel`, or 0 where the input
 * has no heading at all — a shift of nothing is what a document without headings
 * asks for, in either direction.
 */
export function headingOffsetTo(root: ParentNode, topLevel: number): number {
  const min = minHeadingLevel(root);
  return min === null ? 0 : topLevel - min;
}

/** Fills in `headingOffset` from `topHeadingLevel`, once the root is sanitized. */
export function resolveHeadingOffset(
  root: ParentNode,
  options: MarkItDownOptions,
): MarkItDownOptions {
  if (options.headingOffset !== undefined || options.topHeadingLevel === undefined) return options;
  return { ...options, headingOffset: headingOffsetTo(root, options.topHeadingLevel) };
}
