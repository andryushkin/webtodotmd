import { toMarkdown } from '../../../htmltodotmd/src/browser.ts';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'CONVERT_HTML') return;
  const md = toMarkdown(msg.html as string, { baseUrl: msg.baseUrl });
  sendResponse({ md });
});
