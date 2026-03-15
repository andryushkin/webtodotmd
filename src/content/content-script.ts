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
    const md = selectionToMarkdown(selection, {
      baseUrl: window.location.href,
      headingOffset: 1,
    });

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
