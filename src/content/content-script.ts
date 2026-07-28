import type { PageMeta, CaptureSelectionResponse, CaptureErrorResponse, OpenAndCaptureRequest } from '../shared/messaging';
import { icon } from '../shared/icons';
import { highlightsToMd, selectionToCapture, type Capture, type CaptureOptions } from './capture';
import { BLOCK_TAGS, findHighlightTarget } from './highlight-target';
import { normalizePageTitle } from './page-title';
import { hasCapturableSelection } from './shadow-selection';
// i18n: translations loaded from service worker via message passing
// (content scripts cannot reliably fetch extension _locales files)

/**
 * The capture options the user can change (see Settings.htmlTables), plus the
 * heading level the panel already holds for this page — the panel is the only
 * thing that knows, since each press of the button is its own conversion here.
 */
function captureOptions(headingBase?: number): CaptureOptions {
  return { htmlTables: htmlTablesSetting, withHtml: copyHtmlSetting, headingBase };
}

function captureSelectionMd(selection: Selection, headingBase?: number): Capture {
  return selectionToCapture(selection, document, captureOptions(headingBase));
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
let htmlTablesSetting = false;
let copyHtmlSetting = false;
let translations: Record<string, string> = {};

/**
 * Resolves once the stored settings have been read — every capture waits on it.
 *
 * `ensureContentScript()` resolves as soon as `executeScript()` has evaluated
 * the script, and the panel sends CAPTURE_SELECTION straight after; this
 * callback had not run yet. The first capture on a freshly injected page
 * therefore converted with `htmlTables` at its initial `false`, and a table the
 * user had asked to keep as HTML came out flattened — once, unreproducibly,
 * exactly when the user was least able to explain it.
 */
const settingsLoaded = new Promise<void>((resolve) => {
  // A capture waits for this, so it must always settle. If the extension context
  // is invalidated after the read is issued — a reload or an update while the page
  // is open — the callback is simply dropped, and without this timer the handler
  // would never answer and the panel would wait forever. Falling back to the
  // defaults gives the reader the old behaviour instead of nothing.
  setTimeout(resolve, 500);
  try {
    chrome.storage.local.get(['settings', 'contentI18n'], ({ settings, contentI18n }) => {
      if (settings?.showBubble === false) showBubbleSetting = false;
      htmlTablesSetting = settings?.htmlTables === true;
      copyHtmlSetting = settings?.copyHtmlButton === true;
      if (contentI18n) translations = contentI18n;
      resolve();
    });
  } catch {
    // Context already invalidated — the defaults are all this page will get.
    resolve();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) {
    showBubbleSetting = changes.settings.newValue?.showBubble !== false;
    htmlTablesSetting = changes.settings.newValue?.htmlTables === true;
    copyHtmlSetting = changes.settings.newValue?.copyHtmlButton === true;
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
  // `rangeCount` as well as the text, because the bubble is placed off a range
  // and a browser with none to give cannot be shown one.
  if (sel && sel.rangeCount > 0 && hasCapturableSelection(sel)) {
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
  // Set here rather than once at creation: the translations arrive after the
  // bubble may already exist, and the title was left in English for every locale
  // by being written at creation from a literal.
  const label = i18n('bubbleText', 'add to .md');
  bubble.innerHTML = icon('crosshair', 12) + ' ' + label;
  bubble.title = label;
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
  highlightColor = color;
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

/** The colour the marks are drawn in, kept for the inline copy below. */
let highlightColor = '#2563eb';

// What the mark is written in, twice over.
//
// The class is the ordinary half. The inline copy exists because an application
// that re-renders owns `className`: React writes the attribute out again on every
// update, and on X a mark vanished the moment the tweet re-rendered — the element
// stayed highlighted as far as the extension was concerned, and the reader saw no
// outline at all. An inline declaration survives that, since nothing on the page
// is writing `style` on these elements.
//
// Restored, not removed: the page may own these properties, and a mark that
// cleared them would edit what the reader sees after the highlighter is off.
const MARK_PROPERTIES = ['outline', 'outline-offset', 'background-color'] as const;
const priorInline = new WeakMap<Element, Array<[string, string, string]>>();

function paintHighlight(el: Element): void {
  const style = (el as HTMLElement).style;
  if (!style) return;
  priorInline.set(
    el,
    MARK_PROPERTIES.map((name) => [name, style.getPropertyValue(name), style.getPropertyPriority(name)]),
  );
  style.setProperty('outline', `2px solid ${highlightColor}`, 'important');
  style.setProperty('outline-offset', '1px', 'important');
  style.setProperty('background-color', `${highlightColor}14`, 'important');
  el.classList.add('s2md-highlighted');
}

function unpaintHighlight(el: Element): void {
  el.classList.remove('s2md-highlighted');
  const style = (el as HTMLElement).style;
  if (!style) return;
  for (const [name, value, priority] of priorInline.get(el) ?? []) {
    if (value === '') style.removeProperty(name);
    else style.setProperty(name, value, priority);
  }
  priorInline.delete(el);
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
    unpaintHighlight(target);
  } else {
    // Drop any ancestor that is already highlighted
    let ancestor: Element | null = target.parentElement;
    while (ancestor && ancestor !== document.body) {
      if (highlights.has(ancestor)) {
        highlights.delete(ancestor);
        unpaintHighlight(ancestor);
      }
      ancestor = ancestor.parentElement;
    }

    // Drop every descendant now covered by the new element
    for (const el of [...highlights]) {
      if (target.contains(el)) {
        highlights.delete(el);
        unpaintHighlight(el);
      }
    }

    highlights.add(target);
    paintHighlight(target);
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
  highlights.forEach(unpaintHighlight);
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

function captureHighlightsMd(headingBase?: number): Capture {
  // The marks come off for the length of the capture, the same reason the bubble
  // is dropped from the clone: the outline and the wash are the extension's, not
  // the page's, and the inline copy of them would otherwise reach the snapshot
  // and the copied markup as if the page had written them.
  const painted = [...highlights];
  for (const el of painted) unpaintHighlight(el);
  try {
    return highlightsToMd(highlights, document, captureOptions(headingBase));
  } finally {
    for (const el of painted) paintHighlight(el);
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
    (async () => {
      await settingsLoaded;
      try {
        const { md, html, topLevel } = captureHighlightsMd(msg.headingBase);
        const meta: PageMeta = {
          title: findPageTitle(),
          url: window.location.href,
          date: new Date().toISOString(),
        };
        sendResponse({ md, meta, html, topLevel } satisfies CaptureSelectionResponse);
      } catch {
        sendResponse({ error: 'CONVERSION_ERROR' } satisfies CaptureErrorResponse);
      }
    })();
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
    if (!hasCapturableSelection(selection)) {
      sendResponse({ error: 'NO_SELECTION' } satisfies CaptureErrorResponse);
      return true;
    }

    (async () => {
      await settingsLoaded;
      try {
        const { md, html, topLevel } = captureSelectionMd(selection, msg.headingBase);
        const meta: PageMeta = {
          title: findPageTitle(),
          url: window.location.href,
          date: new Date().toISOString(),
        };
        window.getSelection()?.removeAllRanges();
        sendResponse({ md, meta, html, topLevel } satisfies CaptureSelectionResponse);
      } catch {
        sendResponse({ error: 'CONVERSION_ERROR' } satisfies CaptureErrorResponse);
      }
    })();

    return true;
  }

  if (msg.type === 'CAPTURE_AND_COPY') {
    const selection = window.getSelection();
    if (!hasCapturableSelection(selection)) {
      showToast(i18n('toastNoSelection', 'Nothing selected'), 'error');
      sendResponse({});
      return true;
    }

    (async () => {
      await settingsLoaded;
      try {
        const { md } = captureSelectionMd(selection);
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
