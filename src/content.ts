import { selectionToMarkdown } from '@markitdown/core';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'CAPTURE_SELECTION') return;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    sendResponse({ md: '' });
    return;
  }

  const md = selectionToMarkdown(selection, {
    baseUrl: window.location.href,
    headingOffset: 1,
  });

  sendResponse({ md });
});
