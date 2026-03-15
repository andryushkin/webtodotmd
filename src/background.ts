async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Convert HTML to Markdown',
  });
}

export async function convertHtml(html: string, baseUrl: string): Promise<string> {
  await ensureOffscreen();
  const { md } = await chrome.runtime.sendMessage({
    type: 'CONVERT_HTML',
    html,
    baseUrl,
  });
  return md;
}
