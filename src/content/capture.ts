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
import {
  toMarkdown,
  enrichRange,
  offsetForTop,
  topHeadingLevelAcross,
} from '../../core/src/browser.ts';
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
  /**
   * Also hand back the markup the conversion was given.
   *
   * Off unless the reader asked for it (Settings.showHtmlView): the fragment is
   * the whole selection with a computed style written onto every element that
   * needed one, which on a long article is larger than the Markdown it produces,
   * and nothing in the ordinary path reads it.
   */
  withHtml?: boolean;
  /**
   * The shallowest heading level of what the panel already holds for this page.
   *
   * A person captures a page in several goes, and each press is its own
   * conversion: capture the `<h2>` of a section, then the `<h3>` under it, and
   * both arrive at `##` because each answered the heading question alone. The
   * panel remembers the level across presses and hands it back here, so the
   * second capture is shifted by what the first was shifted by.
   */
  headingBase?: number;
}

/** What one capture produced: the file, and — on request — its input. */
export interface Capture {
  md: string;
  /** The fragment handed to the converter, exactly as the converter saw it. */
  html?: string;
  /**
   * The shallowest heading level in this capture, before any shift — what the
   * panel accumulates and hands back as `headingBase` next time. Absent where
   * the capture holds no heading at all.
   */
  topLevel?: number;
}

/**
 * The clone as text, taken before the conversion rather than after.
 *
 * `toMarkdown` sanitizes in place — hidden boxes removed, wrappers unwrapped,
 * whitespace collapsed — so a fragment serialized afterwards would be a report
 * about the sanitizer rather than about the page. What this shows is the input:
 * the reader's selection, carrying the style snapshot, which is what makes a
 * defect reproducible from the panel alone.
 */
function serialize(fragment: DocumentFragment, doc: Document): string {
  const holder = doc.createElement('div');
  holder.appendChild(fragment.cloneNode(true));
  return holder.innerHTML;
}

function conversionOptions(doc: Document, options: CaptureOptions): MarkItDownOptions {
  return {
    baseUrl: doc.baseURI,
    ...CONVERSION_OPTIONS,
    complexTableFallback: options.htmlTables ? 'html' : 'flatten',
  };
}

/**
 * The heading shift, settled across the whole capture rather than per fragment,
 * and across the presses before it rather than this one alone.
 *
 * Two things cannot answer for themselves. A highlighter run is many fragments,
 * and each one asking on its own puts an `<h2>` and the `<h3>` under it at the
 * same rank. A second press of the button is a second conversion, and the panel
 * appends its result to the first — so the level has to come back out of here
 * (`topLevel`) and back in next time (`headingBase`), or a page captured in
 * three goes comes back as three `##` with nothing under them.
 *
 * The probe is a copy: `sanitize()` edits what it is handed, and these fragments
 * are about to be converted for real. It is also what makes the answer the same
 * one `toMarkdown` would reach alone — a heading hidden from the reader is gone
 * by the time the level is read, on both paths.
 */
function sharedHeadingOffset(
  fragments: DocumentFragment[],
  opts: MarkItDownOptions,
  base: number | undefined,
): { options: MarkItDownOptions; topLevel: number | undefined } {
  const own = topHeadingLevelAcross(fragments, opts);
  const top = own === null ? (base ?? null) : Math.min(own, base ?? own);
  if (opts.topHeadingLevel === undefined || top === null) {
    return { options: opts, topLevel: own ?? undefined };
  }
  return {
    options: { ...opts, headingOffset: offsetForTop(top, opts.topHeadingLevel) },
    topLevel: own ?? undefined,
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

/**
 * What the extension itself put on the page.
 *
 * The bubble sits in the document like any other element, so a Cmd+A selection
 * covers it and every full-page capture ended with the words `add to .md`. The
 * highlighter's hover outline is the same kind of thing. They are removed from
 * the clone rather than hidden on the page: hiding is a mutation the reader
 * would see, and the clone is ours to edit.
 */
const OWN_UI = '#tomd-bubble, #s2md-hover';

function dropOwnUI(fragment: DocumentFragment): void {
  for (const el of Array.from(fragment.querySelectorAll(OWN_UI))) el.remove();
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
  dropOwnUI(fragment);
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
export function captureStyles(
  scopes: Array<Element | null>,
  doc: Document,
  diagnostics = false,
): () => void {
  const roots = scopes.filter((el): el is Element => el !== null);
  if (roots.length === 0) return () => {};
  const computed = computedStyleIn(doc.defaultView ?? window);
  const preserving = elementsPreservingNewlines(roots, computed);
  // `snapshotStyles` swallows its own faults and always hands back a working
  // undo: a style the browser cannot resolve is a worse conversion, never a
  // failed capture, and never an attribute left on the page.
  const restoreStyles = snapshotStyles(roots, computed, diagnostics);
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
  return selectionToCapture(selection, doc, options).md;
}

export function selectionToCapture(
  selection: Selection,
  doc: Document,
  options: CaptureOptions = {},
): Capture {
  // Collected once and spent twice: the composed range has to be told which
  // shadow roots it may answer inside, and the copies below are made from the
  // same list — two walks would be two answers to the same question.
  const shadowRoots = openShadowRoots(doc);
  const ranges = selectionRanges(selection, shadowRoots, doc);
  const restoreStyles = captureStyles(
    ranges.map((range) => styleScopeOf(range, snapshotScope(range))),
    doc,
    options.withHtml,
  );
  try {
    const cleanup = mirrorShadowRoots(shadowRoots);
    try {
      const opts = conversionOptions(doc, options);
      const markup: string[] = [];
      // Cloned first and converted after, because the heading shift is a question
      // about every fragment and `toMarkdown` consumes the one it is given.
      const clones = ranges.map((range) => {
        const fragment = cloneRangeWithBr(expandRangeToWords(range));
        if (options.withHtml) markup.push(serialize(fragment, doc));
        return fragment;
      });
      const shifted = sharedHeadingOffset(clones, opts, options.headingBase);
      const fragments = clones.map((fragment) =>
        collapseHardBreaksToParagraphs(toMarkdown(fragment, shifted.options)),
      );
      return {
        md: joinFragments(fragments),
        html: options.withHtml ? markup.join('\n') : undefined,
        topLevel: shifted.topLevel,
      };
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
): Capture {
  const sorted = [...highlights].sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const restoreStyles = captureStyles(
    sorted.map(el => el.closest('table') ?? el),
    doc,
    options.withHtml,
  );
  try {
    const cleanup = mirrorShadowRoots(openShadowRoots(doc));
    try {
      const opts = conversionOptions(doc, options);
      const markup: string[] = [];
      // Two passes for the reason `sharedHeadingOffset` states, and this is the
      // path that needs it: each highlighted element is its own fragment.
      const clones = sorted.map(el => {
        const range = doc.createRange();
        range.selectNodeContents(el);
        const fragment = cloneRangeWithBr(range);
        if (options.withHtml) markup.push(serialize(fragment, doc));
        return fragment;
      });
      const shifted = sharedHeadingOffset(clones, opts, options.headingBase);
      const fragments = clones.map(fragment =>
        collapseHardBreaksToParagraphs(toMarkdown(fragment, shifted.options)),
      );
      return {
        md: joinFragments(fragments),
        html: options.withHtml ? markup.join('\n') : undefined,
        topLevel: shifted.topLevel,
      };
    } finally {
      cleanup();
    }
  } finally {
    restoreStyles();
  }
}
