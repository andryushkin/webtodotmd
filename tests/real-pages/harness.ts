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
import { mirrorShadowRoots, openShadowRoots } from '../../src/content/shadow-selection';

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
  /** What each open component draws, which the page text above cannot reach. */
  componentTexts: string[];
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

/**
 * The text of every open component on the page, each host's own.
 *
 * `innerText` is defined over the node tree rather than the flat tree, so
 * `body.innerText` walks past a shadow host without entering it and without
 * reading its light children either: on a GitHub listing the whole column of
 * dates is simply absent from it, while the capture carries `9 hours ago` for
 * each. Asked *of the host*, after the shadow tree has been mirrored into it,
 * `innerText` answers — so the components are read one at a time and kept beside
 * the page text rather than inside it.
 *
 * Position is what this cannot give back. A difference matching one of these
 * strings is a component the page text never mentioned, not text the capture
 * invented, and `analyze.ts` classifies it as `shadow` on that basis.
 */
function componentTexts(): string[] {
  const roots = openShadowRoots(document);
  if (roots.length === 0) return [];
  const undo = mirrorShadowRoots(roots);
  try {
    const seen = new Set<string>();
    for (const root of roots) {
      const text = (root.host as HTMLElement).innerText?.trim();
      if (text) seen.add(text);
    }
    return [...seen];
  } finally {
    undo();
  }
}

export function capture(selector: string | null, options: CaptureOptions = {}): PageCapture {
  const doc = document;
  const base: PageCapture = {
    md: '',
    visibleText: '',
    selectionText: '',
    componentTexts: [],
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
  const components = componentTexts();
  const started = performance.now();
  try {
    const md = selectionToMd(selection, doc, options);
    return {
      ...base, md, visibleText, selectionText,
      componentTexts: components, ms: performance.now() - started,
    };
  } catch (err) {
    return {
      ...base,
      visibleText,
      selectionText,
      componentTexts: components,
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
