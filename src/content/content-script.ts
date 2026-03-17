import { selectionToMarkdown } from '../../../markitdown/src/browser.ts';
import type { PageMeta, CaptureSelectionResponse, CaptureErrorResponse, OpenAndCaptureRequest } from '../shared/messaging';
import { icon } from '../shared/icons';

// ---- Shadow DOM flattening ----

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
    if (selection.rangeCount > 1) {
      const fragments: string[] = [];
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const sel = { rangeCount: 1, getRangeAt: () => range } as unknown as Selection;
        fragments.push(selectionToMarkdown(sel, { baseUrl: window.location.href, headingOffset: 1 }));
      }
      return fragments.join('\n\n');
    }
    return selectionToMarkdown(selection, { baseUrl: window.location.href, headingOffset: 1 });
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

// ---- Settings ----

let showBubbleSetting = true;

chrome.storage.local.get('settings', ({ settings }) => {
  if (settings?.showBubble === false) showBubbleSetting = false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    showBubbleSetting = changes.settings.newValue?.showBubble !== false;
  }
});

// ---- Floating bubble ----

let bubble: HTMLElement | null = null;
let bubbleClicked = false;
let mouseDownHiding = false;

document.addEventListener('mousedown', (e) => {
  if (bubble && bubble.style.display !== 'none' && e.target !== bubble) {
    hideBubble();
    mouseDownHiding = true;
  }
});

document.addEventListener('mouseup', () => {
  mouseDownHiding = false;
});

document.addEventListener('selectionchange', () => {
  if (highlighterActive || !showBubbleSetting || bubbleClicked || mouseDownHiding) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
    showBubble(sel);
  } else {
    hideBubble();
  }
});

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
    bubble.innerHTML = icon('crosshair', 12) + ' add to .md';
    bubble.addEventListener('mousedown', (e) => {
      e.preventDefault(); // preserve selection for capture
      bubbleClicked = true;
      chrome.runtime.sendMessage({ type: 'OPEN_AND_CAPTURE' } satisfies OpenAndCaptureRequest);
      hideBubble();
      setTimeout(() => {
        window.getSelection()?.removeAllRanges(); // clear selection after capture signal sent
        bubbleClicked = false;
      }, 400);
    });
    document.body.appendChild(bubble);
  }
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

const BLOCK_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE',
  'PRE', 'TABLE', 'FIGURE', 'TR', 'SECTION', 'ARTICLE', 'DETAILS',
]);

function findHighlightTarget(el: Element): Element {
  let current: Element | null = el;
  while (current && current !== document.body && current !== document.documentElement) {
    if (BLOCK_TAGS.has(current.tagName)) return current;
    current = current.parentElement;
  }
  return el;
}

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

function captureHighlightsMd(): string {
  const sorted = [...highlights].sort((a, b) => {
    const pos = a.compareDocumentPosition(b);
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  const cleanup = expandShadowRoots();
  try {
    const fragments = sorted.map(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const fakeSel = { rangeCount: 1, getRangeAt: () => range } as unknown as Selection;
      return selectionToMarkdown(fakeSel, { baseUrl: window.location.href, headingOffset: 1 });
    });
    return fragments.join('\n\n');
  } finally {
    cleanup();
  }
}

// ---- Message listener ----

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ pong: true });
    return true;
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
        title: document.title,
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
    if (!selection || selection.rangeCount === 0) {
      sendResponse({ error: 'NO_SELECTION' } satisfies CaptureErrorResponse);
      return true;
    }

    try {
      const md = selectionToMd(selection);
      const meta: PageMeta = {
        title: document.title,
        url: window.location.href,
        date: new Date().toISOString(),
      };
      sendResponse({ md, meta } satisfies CaptureSelectionResponse);
    } catch {
      sendResponse({ error: 'CONVERSION_ERROR' } satisfies CaptureErrorResponse);
    }

    return true;
  }

  if (msg.type === 'CAPTURE_AND_COPY') {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      showToast('No text selected', 'error');
      sendResponse({});
      return true;
    }

    (async () => {
      try {
        const md = selectionToMd(selection);
        await navigator.clipboard.writeText(md);
        showToast('Copied as Markdown ✓');
      } catch {
        showToast('Could not copy', 'error');
      }
      sendResponse({});
    })();

    return true;
  }
});
