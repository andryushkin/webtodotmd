/**
 * The capture itself: a selection, or a list of highlighted elements, into
 * Markdown.
 *
 * It lives apart from `content-script.ts` for the reason that file states —
 * top-level Chrome API calls make it unimportable — and everything here is
 * asked for by something that has no Chrome around it: a test, or a harness
 * driving a real page. What the page-facing script keeps is the part that talks
 * to the extension; what moved is the part that reads the page.
 */
import { toMarkdown, enrichRange } from '../../core/src/browser.ts';
import type { MarkItDownOptions } from '../../core/src/browser.ts';
import { CONVERSION_OPTIONS } from './raw-mathml-rule';
import { computedStyleIn, snapshotScope, snapshotStyles } from './style-snapshot';
import {
  breakPreservedNewlines,
  collapseHardBreaksToParagraphs,
  elementsPreservingNewlines,
  markPreservedNewlines,
  rangePreservesNewlines,
} from './hard-breaks';
import { joinFragments } from './join-fragments';
import { mirrorShadowRoots, openShadowRoots, selectionRanges, styleScopeOf } from './shadow-selection';

/** The one conversion option the user can change; see Settings.htmlTables. */
export interface CaptureOptions {
  htmlTables?: boolean;
}

function conversionOptions(doc: Document, options: CaptureOptions): MarkItDownOptions {
  return {
    baseUrl: doc.baseURI,
    ...CONVERSION_OPTIONS,
    complexTableFallback: options.htmlTables ? 'html' : 'flatten',
  };
}

// Expands a Range to whitespace boundaries when start/end land mid-token
// in text nodes (token = run of non-whitespace, includes letters/digits/
// punctuation). Element-boundary selections are left untouched.
const WORD_CHAR_RE = /\S/u;
export function expandRangeToWords(range: Range): Range {
  const out = range.cloneRange();
  const { startContainer, startOffset, endContainer, endOffset } = out;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    const text = startContainer.textContent ?? '';
    let i = startOffset;
    while (i > 0 && WORD_CHAR_RE.test(text[i - 1]!)) i--;
    if (i !== startOffset) out.setStart(startContainer, i);
  }
  if (endContainer.nodeType === Node.TEXT_NODE) {
    const text = endContainer.textContent ?? '';
    let i = endOffset;
    while (i < text.length && WORD_CHAR_RE.test(text[i]!)) i++;
    if (i !== endOffset) out.setEnd(endContainer, i);
  }
  return out;
}

export function cloneRangeWithBr(range: Range): DocumentFragment {
  // Read before the clone, not after: `cloneContents()` strands the children of
  // the common ancestor at the top of the fragment, where a text node has no
  // parent element left to carry the verdict (`hard-breaks.ts`).
  const rootPreserves = rangePreservesNewlines(range);
  // enrichRange, not cloneContents: a partial selection loses the context around
  // it — a table's header row, a code block's language, a list's numbering — and
  // restoring that is the core's job. This path had been calling cloneContents
  // directly, so none of it reached the extension.
  const fragment = enrichRange(range);
  breakPreservedNewlines(fragment, rootPreserves);
  return fragment;
}

/**
 * Records what the page's stylesheets say, for the length of one capture.
 *
 * Before anything else: `getComputedStyle` is answered from a cache Chrome throws
 * away on the next DOM change, and both `snapshotStyles()` and
 * `mirrorShadowRoots()` change the DOM. Reading first is what keeps a capture one
 * style recalculation rather than one per element.
 *
 * Two things are read here and both of them are read before either writes: which
 * newlines the page drew as lines (`hard-breaks.ts`) is a second question for the
 * same live nodes, and asking it after the snapshot had written its attributes
 * would buy the scope a style recalculation for nothing.
 *
 * The cleanup takes every attribute back off, so it belongs in a `finally`
 * outside the conversion — the clone is taken while they are still on.
 */
export function captureStyles(scopes: Array<Element | null>, doc: Document): () => void {
  const roots = scopes.filter((el): el is Element => el !== null);
  if (roots.length === 0) return () => {};
  const computed = computedStyleIn(doc.defaultView ?? window);
  const preserving = elementsPreservingNewlines(roots, computed);
  // `snapshotStyles` swallows its own faults and always hands back a working
  // undo: a style the browser cannot resolve is a worse conversion, never a
  // failed capture, and never an attribute left on the page.
  const restoreStyles = snapshotStyles(roots, computed);
  const unmark = markPreservedNewlines(preserving);
  return () => {
    unmark();
    restoreStyles();
  };
}

export function selectionToMd(
  selection: Selection,
  doc: Document,
  options: CaptureOptions = {},
): string {
  // Collected once and spent twice: the composed range has to be told which
  // shadow roots it may answer inside, and the copies below are made from the
  // same list — two walks would be two answers to the same question.
  const shadowRoots = openShadowRoots(doc);
  const ranges = selectionRanges(selection, shadowRoots, doc);
  const restoreStyles = captureStyles(
    ranges.map((range) => styleScopeOf(range, snapshotScope(range))),
    doc,
  );
  try {
    const cleanup = mirrorShadowRoots(shadowRoots);
    try {
      const opts = conversionOptions(doc, options);
      const fragments = ranges.map((range) =>
        collapseHardBreaksToParagraphs(toMarkdown(cloneRangeWithBr(expandRangeToWords(range)), opts)),
      );
      return joinFragments(fragments);
    } finally {
      cleanup();
    }
  } finally {
    restoreStyles();
  }
}

export function highlightsToMd(
  highlights: Iterable<Element>,
  doc: Document,
  options: CaptureOptions = {},
): string {
  const sorted = [...highlights].sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const restoreStyles = captureStyles(sorted.map(el => el.closest('table') ?? el), doc);
  try {
    const cleanup = mirrorShadowRoots(openShadowRoots(doc));
    try {
      const opts = conversionOptions(doc, options);
      const fragments = sorted.map(el => {
        const range = doc.createRange();
        range.selectNodeContents(el);
        return collapseHardBreaksToParagraphs(toMarkdown(cloneRangeWithBr(range), opts));
      });
      return joinFragments(fragments);
    } finally {
      cleanup();
    }
  } finally {
    restoreStyles();
  }
}
