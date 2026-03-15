import { toMarkdown } from '@markitdown/core';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'CONVERT_HTML') return;
  const md = toMarkdown(msg.html as string, { baseUrl: msg.baseUrl });
  sendResponse({ md });
});
