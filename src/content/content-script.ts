import { selectionToMarkdown } from '@markitdown/core';
import type { PageMeta, CaptureSelectionResponse, CaptureErrorResponse } from '../shared/messaging';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'CAPTURE_SELECTION') return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    sendResponse({ error: 'NO_SELECTION' } satisfies CaptureErrorResponse);
    return true;
  }

  try {
    let md: string;
    if (selection.rangeCount > 1) {
      const fragments: string[] = [];
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const sel = { rangeCount: 1, getRangeAt: () => range } as unknown as Selection;
        fragments.push(selectionToMarkdown(sel, { baseUrl: window.location.href, headingOffset: 1 }));
      }
      md = fragments.join('\n\n');
    } else {
      md = selectionToMarkdown(selection, {
        baseUrl: window.location.href,
        headingOffset: 1,
      });
    }

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
});
