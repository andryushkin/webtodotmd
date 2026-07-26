import { toMarkdown } from '../../core/src/browser.ts';
import type { PageMeta, CaptureSelectionResponse, CaptureErrorResponse, OpenAndCaptureRequest } from '../shared/messaging';
import { icon } from '../shared/icons';
import { CONVERSION_OPTIONS } from './raw-mathml-rule';
import { BLOCK_TAGS, findHighlightTarget } from './highlight-target';
import { normalizePageTitle } from './page-title';
// i18n: translations loaded from service worker via message passing
// (content scripts cannot reliably fetch extension _locales files)

// ---- Shadow DOM flattening ----

// Clones a Range into a DocumentFragment and replaces literal \n in text nodes
// with <br> elements so that sites like Instagram (which use \n in <span> text
// nodes instead of <p>/<br>) produce correct paragraph breaks in Markdown.
// Expands a Range to whitespace boundaries when start/end land mid-token
// in text nodes (token = run of non-whitespace, includes letters/digits/
// punctuation). Element-boundary selections are left untouched.
const WORD_CHAR_RE = /\S/u;
function expandRangeToWords(range: Range): Range {
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

function cloneRangeWithBr(range: Range): DocumentFragment {
  const fragment = range.cloneContents();
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node as Text);
    node = walker.nextNode();
  }
  for (const textNode of textNodes) {
    if (!textNode.textContent?.includes('\n')) continue;
    let ancestor: Element | null = textNode.parentElement;
    let skip = false;
    while (ancestor) {
      const tag = ancestor.tagName.toLowerCase();
      if (['pre', 'code', 'script', 'style', 'svg', 'math', 'textarea'].includes(tag)) {
        skip = true; break;
      }
      if (/white-space\s*:\s*pre/.test(ancestor.getAttribute('style') || '')) {
        skip = true; break;
      }
      ancestor = ancestor.parentElement;
    }
    if (skip) continue;
    const parts = textNode.textContent.split('\n');
    if (parts.length <= 1) continue;
    // Drop leading/trailing whitespace-only parts (HTML indentation between
    // tags is not author-intent line break). Keep inner empty parts so that
    // consecutive \n\n in author content (e.g. Instagram captions) stays.
    let start = 0, end = parts.length;
    while (start < end - 1 && /^\s*$/.test(parts[start]!)) start++;
    while (end > start + 1 && /^\s*$/.test(parts[end - 1]!)) end--;
    const effective = parts.slice(start, end);
    if (effective.length <= 1) continue;
    const frag = document.createDocumentFragment();
    effective.forEach((part, i) => {
      if (i > 0) frag.appendChild(document.createElement('br'));
      frag.appendChild(document.createTextNode(part));
    });
    textNode.replaceWith(frag);
  }
  return fragment;
}

// Collapses 2+ consecutive hard line breaks (`\<NL>` from <br>) into paragraph
// breaks. Guards fenced code blocks where backslash-newline may be legitimate
// (e.g. shell line continuations). See plan: glimmering-strolling-stardust.md
function collapseHardBreaksToParagraphs(md: string): string {
  const segments = md.split(/(^```[\s\S]*?^```$)/gm);
  return segments
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg.replace(/(?:\\\n[ \t]*){2,}/g, '\n\n');
    })
    .join('');
}

function expandShadowRoots(): () => void {
  const cleanups: (() => void)[] = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.shadowRoot) {
      const wrapper = document.createElement('s2md-shadow');
      wrapper.innerHTML = el.shadowRoot.innerHTML;
      el.prepend(wrapper);
      cleanups.push(() => wrapper.remove());
    }
  });
  return () => cleanups.forEach(fn => fn());
}

function selectionToMd(selection: Selection): string {
  const cleanup = expandShadowRoots();
  try {
    const opts = { baseUrl: document.baseURI, ...CONVERSION_OPTIONS };
    if (selection.rangeCount > 1) {
      const fragments: string[] = [];
      for (let i = 0; i < selection.rangeCount; i++) {
        fragments.push(collapseHardBreaksToParagraphs(toMarkdown(cloneRangeWithBr(expandRangeToWords(selection.getRangeAt(i))), opts)));
      }
      return fragments.join('\n\n');
    }
    return collapseHardBreaksToParagraphs(toMarkdown(cloneRangeWithBr(expandRangeToWords(selection.getRangeAt(0))), opts));
  } finally {
    cleanup();
  }
}

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '20px', right: '20px', zIndex: '2147483647',
    padding: '10px 16px', borderRadius: '6px', fontSize: '14px',
    color: '#fff', background: type === 'error' ? '#e53e3e' : '#2f855a',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// ---- Settings & i18n ----

let showBubbleSetting = true;
let translations: Record<string, string> = {};

chrome.storage.local.get(['settings', 'contentI18n'], ({ settings, contentI18n }) => {
  if (settings?.showBubble === false) showBubbleSetting = false;
  if (contentI18n) translations = contentI18n;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) {
    showBubbleSetting = changes.settings.newValue?.showBubble !== false;
  }
  if (changes.contentI18n) {
    translations = changes.contentI18n.newValue ?? {};
    bubble?.remove();
    bubble = null;
    const sel = window.getSelection();
    if (sel && sel.toString().trim() && sel.rangeCount > 0) {
      showBubble(sel);
    }
  }
});

// ---- Context validity ----

function isContextValid(): boolean {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

function selfDestruct(): void {
  document.removeEventListener('mousedown', onMouseDown);
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('selectionchange', onSelectionChange);
  if (highlighterActive) {
    document.removeEventListener('mouseover', onHighlighterHover);
    document.removeEventListener('mouseout', onHighlighterOut);
    document.removeEventListener('click', onHighlighterClick, true);
  }
  hoverOverlay?.remove();
  bubble?.remove();
  bubble = null;
}

// ---- Floating bubble ----

let bubble: HTMLElement | null = null;
let bubbleClicked = false;
let mouseDownHiding = false;

function onMouseDown(e: MouseEvent) {
  if (bubble && bubble.style.display !== 'none' && e.target !== bubble) {
    hideBubble();
    mouseDownHiding = true;
  }
}

function onMouseUp() {
  mouseDownHiding = false;
}

function onSelectionChange() {
  if (!isContextValid()) { selfDestruct(); return; }
  if (highlighterActive || !showBubbleSetting || bubbleClicked || mouseDownHiding) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
    showBubble(sel);
  } else {
    hideBubble();
  }
}

document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mouseup', onMouseUp);
document.addEventListener('selectionchange', onSelectionChange);

function showBubble(sel: Selection) {
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.id = 'tomd-bubble';
    bubble.title = 'add to .md';
    bubble.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'padding:3px 8px',
      'border-radius:6px',
      'background:#fff',
      'color:#1a1a1a',
      'border:1px solid rgba(0,0,0,0.15)',
      'box-shadow:0 1px 4px rgba(0,0,0,0.12)',
      'font-size:11px',
      'font-family:system-ui,sans-serif',
      'font-weight:500',
      'line-height:1.5',
      'white-space:nowrap',
      'display:inline-flex',
      'gap:4px',
      'align-items:center',
      'cursor:pointer',
      'user-select:none',
      '-webkit-font-smoothing:antialiased',
    ].join(';');
    bubble.addEventListener('mousedown', (e) => {
      e.preventDefault(); // preserve selection for capture
      bubbleClicked = true;
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_AND_CAPTURE' } satisfies OpenAndCaptureRequest);
      } catch { /* context invalidated — ignore */ }
      hideBubble();
      setTimeout(() => {
        window.getSelection()?.removeAllRanges(); // clear selection after capture signal sent
        bubbleClicked = false;
      }, 400);
    });
    document.body.appendChild(bubble);
  }
  bubble.innerHTML = icon('crosshair', 12) + ' ' + i18n('bubbleText', 'add to .md');
  const range = sel.getRangeAt(sel.rangeCount - 1);
  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
  bubble.style.left = (rect.right + 6) + 'px';
  bubble.style.top = (rect.bottom + 4) + 'px';
  bubble.style.display = 'inline-flex';
}

function hideBubble() {
  if (bubble) bubble.style.display = 'none';
}

// ---- Highlighter mode ----

let highlighterActive = false;
const highlights = new Set<Element>();
let hoverOverlay: HTMLElement | null = null;
let highlighterStyleEl: HTMLStyleElement | null = null;


function injectHighlighterStyles(color: string) {
  if (highlighterStyleEl) return;
  highlighterStyleEl = document.createElement('style');
  highlighterStyleEl.textContent = `
    .s2md-highlighted {
      outline: 2px solid ${color} !important;
      outline-offset: 1px !important;
      background-color: ${color}14 !important;
    }
  `;
  document.head.appendChild(highlighterStyleEl);
}

function removeHighlighterStyles() {
  highlighterStyleEl?.remove();
  highlighterStyleEl = null;
}

function showHoverOverlay(el: Element) {
  if (!hoverOverlay) {
    hoverOverlay = document.createElement('div');
    hoverOverlay.id = 's2md-hover';
    hoverOverlay.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483646;' +
      'border:2px dashed #2563eb;background:rgba(37,99,235,0.05);' +
      'transition:all 0.15s ease;border-radius:3px';
    document.body.appendChild(hoverOverlay);
  }
  const rect = el.getBoundingClientRect();
  hoverOverlay.style.left = rect.left - 2 + 'px';
  hoverOverlay.style.top = rect.top - 2 + 'px';
  hoverOverlay.style.width = rect.width + 4 + 'px';
  hoverOverlay.style.height = rect.height + 4 + 'px';
  hoverOverlay.style.display = 'block';
}

function hideHoverOverlay() {
  if (hoverOverlay) hoverOverlay.style.display = 'none';
}

function onHighlighterHover(e: MouseEvent) {
  const target = findHighlightTarget(e.target as Element);
  if (target === document.body || target === document.documentElement) return;
  showHoverOverlay(target);
}

function onHighlighterOut() {
  hideHoverOverlay();
}

function onHighlighterClick(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  const target = findHighlightTarget(e.target as Element);
  if (target === document.body || target === document.documentElement) return;

  if (highlights.has(target)) {
    highlights.delete(target);
    target.classList.remove('s2md-highlighted');
  } else {
    // Drop any ancestor that is already highlighted
    let ancestor: Element | null = target.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (highlights.has(ancestor)) {
        highlights.delete(ancestor);
        ancestor.classList.remove('s2md-highlighted');
      }
      ancestor = ancestor.parentElement;
    }

    // Drop every descendant now covered by the new element
    for (const el of [...highlights]) {
      if (target.contains(el)) {
        highlights.delete(el);
        el.classList.remove('s2md-highlighted');
      }
    }

    highlights.add(target);
    target.classList.add('s2md-highlighted');
  }

  sendHighlightCount();
}

function sendHighlightCount() {
  chrome.runtime.sendMessage({ type: 'HIGHLIGHT_COUNT', count: highlights.size }).catch(() => {});
}

function enableHighlighter(color = '#2563eb') {
  if (highlighterActive) return;
  highlighterActive = true;
  hideBubble();
  injectHighlighterStyles(color);
  document.addEventListener('mouseover', onHighlighterHover);
  document.addEventListener('mouseout', onHighlighterOut);
  document.addEventListener('click', onHighlighterClick, true);
}

function disableHighlighter() {
  if (!highlighterActive) return;
  highlighterActive = false;
  clearHighlights();
  document.removeEventListener('mouseover', onHighlighterHover);
  document.removeEventListener('mouseout', onHighlighterOut);
  document.removeEventListener('click', onHighlighterClick, true);
  hideHoverOverlay();
}

function clearHighlights() {
  highlights.forEach(el => el.classList.remove('s2md-highlighted'));
  highlights.clear();
  removeHighlighterStyles();
  highlighterStyleEl = null;
  sendHighlightCount();
}

function findPageTitle(): string {
  const getMeta = (attr: string, val: string) =>
    document.querySelector(`meta[${attr}="${val}"]`)?.getAttribute('content')?.trim() || '';

  let schemaHeadline = '';
  for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(el.textContent || '');
      if (data.headline) { schemaHeadline = String(data.headline).trim(); break; }
    } catch { /* ignore */ }
  }

  const raw = (
    getMeta('property', 'og:title') ||
    getMeta('name', 'twitter:title') ||
    schemaHeadline ||
    getMeta('name', 'title') ||
    document.title
  );
  return normalizePageTitle(raw);
}

function captureHighlightsMd(): string {
  const sorted = [...highlights].sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const cleanup = expandShadowRoots();
  try {
    const opts = { baseUrl: document.baseURI, ...CONVERSION_OPTIONS };
    const fragments = sorted.map(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return collapseHardBreaksToParagraphs(toMarkdown(cloneRangeWithBr(range), opts));
    });
    return fragments.join('\n\n');
  } finally {
    cleanup();
  }
}

// ---- Message listener ----

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'highlighter') return;
  port.onDisconnect.addListener(() => {
    disableHighlighter();
  });
});

function i18n(key: string, fallback = ''): string {
  if (translations[key]) return translations[key];
  try { return chrome.i18n.getMessage(key) || fallback; } catch { return fallback; }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    if (!isContextValid()) {
      selfDestruct();
      return false; // no response → inject.ts catches error → re-injects fresh script
    }
    sendResponse({ pong: true });
    return false;
  }

  if (msg.type === 'TOGGLE_HIGHLIGHTER') {
    if (msg.active) {
      enableHighlighter(msg.color);
    } else {
      disableHighlighter();
    }
    sendResponse({ active: highlighterActive, count: highlights.size });
    return true;
  }

  if (msg.type === 'CAPTURE_HIGHLIGHTS') {
    if (highlights.size === 0) {
      sendResponse({ error: 'NO_SELECTION' } satisfies CaptureErrorResponse);
      return true;
    }
    try {
      const md = captureHighlightsMd();
      const meta: PageMeta = {
        title: findPageTitle(),
        url: window.location.href,
        date: new Date().toISOString(),
      };
      sendResponse({ md, meta } satisfies CaptureSelectionResponse);
    } catch {
      sendResponse({ error: 'CONVERSION_ERROR' } satisfies CaptureErrorResponse);
    }
    return true;
  }

  if (msg.type === 'CLEAR_HIGHLIGHTS') {
    clearHighlights();
    sendResponse({ count: 0 });
    return true;
  }

  if (msg.type === 'GET_HIGHLIGHTER_STATE') {
    sendResponse({ active: highlighterActive, count: highlights.size });
    return true;
  }

  if (msg.type === 'CAPTURE_SELECTION') {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      sendResponse({ error: 'NO_SELECTION' } satisfies CaptureErrorResponse);
      return true;
    }

    try {
      const md = selectionToMd(selection);
      const meta: PageMeta = {
        title: findPageTitle(),
        url: window.location.href,
        date: new Date().toISOString(),
      };
      window.getSelection()?.removeAllRanges();
      sendResponse({ md, meta } satisfies CaptureSelectionResponse);
    } catch {
      sendResponse({ error: 'CONVERSION_ERROR' } satisfies CaptureErrorResponse);
    }

    return true;
  }

  if (msg.type === 'CAPTURE_AND_COPY') {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      showToast(i18n('toastNoSelection', 'Nothing selected'), 'error');
      sendResponse({});
      return true;
    }

    (async () => {
      try {
        const md = selectionToMd(selection);
        await navigator.clipboard.writeText(md);
        showToast(i18n('toastCopied', 'Copied!'));
      } catch {
        showToast(i18n('toastCouldNotCopy', 'Could not copy'), 'error');
      }
      sendResponse({});
    })();

    return true;
  }
});
