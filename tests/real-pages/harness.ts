/**
 * The capture path, on a real page, without the extension around it.
 *
 * Everything the reader's Cmd+A goes through is here — the style snapshot, the
 * shadow mirroring, the hard-break verdict, the core — and nothing the extension
 * adds on top: no side panel, no messaging, no settings. What it answers is the
 * question the generated fixtures cannot: whether the capture survives markup
 * nobody on this project wrote.
 *
 * Bundled with `bun build --target=browser`, then evaluated over CDP, which is
 * what lets it run on pages whose CSP forbids an injected <script>.
 */
import { selectionToMd, type CaptureOptions } from '../../src/content/capture';

export interface PageCapture {
  /** What the capture produced. */
  md: string;
  /**
   * What the reader saw, as the layout engine reports it.
   *
   * `selection.toString()` is the wrong witness for this: it concatenates
   * across block boundaries, so a column of navigation links reads back as
   * `HomeMoneyVAT` and every one of those boundaries is reported as a blank the
   * file invented. `innerText` is defined in terms of the rendered box tree —
   * it puts the line break where the browser drew one — which is the whole of
   * what this comparison is asking about.
   */
  visibleText: string;
  /** The same selection as the browser concatenates it, kept for reference. */
  selectionText: string;
  title: string;
  url: string;
  /** Milliseconds spent inside the conversion, page-side. */
  ms: number;
  error?: string;
}

function selectAll(doc: Document): Selection | null {
  const selection = doc.defaultView?.getSelection() ?? null;
  if (!selection) return null;
  selection.removeAllRanges();
  const range = doc.createRange();
  range.selectNodeContents(doc.body);
  selection.addRange(range);
  return selection;
}

/** Selects the contents of one element, the way highlighter mode points at it. */
function selectWithin(doc: Document, selector: string): Selection | null {
  const target = doc.querySelector(selector);
  if (!target) return null;
  const selection = doc.defaultView?.getSelection() ?? null;
  if (!selection) return null;
  selection.removeAllRanges();
  const range = doc.createRange();
  range.selectNodeContents(target);
  selection.addRange(range);
  return selection;
}

export function capture(selector: string | null, options: CaptureOptions = {}): PageCapture {
  const doc = document;
  const base: PageCapture = {
    md: '',
    visibleText: '',
    selectionText: '',
    title: doc.title,
    url: location.href,
    ms: 0,
  };
  const selection = selector ? selectWithin(doc, selector) : selectAll(doc);
  if (!selection || selection.isCollapsed) {
    return { ...base, error: selector ? `no match for ${selector}` : 'empty selection' };
  }
  // Read before converting: the capture clears nothing, but the snapshot writes
  // attributes onto the page and a text asked for afterwards would be the text
  // of a page the harness had touched.
  const selectionText = selection.toString();
  const scope = (selector ? doc.querySelector(selector) : doc.body) as HTMLElement | null;
  const visibleText = scope?.innerText ?? selectionText;
  const started = performance.now();
  try {
    const md = selectionToMd(selection, doc, options);
    return { ...base, md, visibleText, selectionText, ms: performance.now() - started };
  } catch (err) {
    return {
      ...base,
      visibleText,
      selectionText,
      ms: performance.now() - started,
      error: err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err),
    };
  }
}

declare global {
  interface Window {
    __s2md: { capture: typeof capture };
  }
}

window.__s2md = { capture };
