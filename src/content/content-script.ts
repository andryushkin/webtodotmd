import { selectionToMarkdown } from '@markitdown/core';
import type { PageMeta, CaptureSelectionResponse, CaptureErrorResponse } from '../shared/messaging';

function selectionToMd(selection: Selection): string {
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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
