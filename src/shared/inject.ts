/**
 * Ensures the content script is loaded in the given tab.
 * Sends a PING first; if no response, injects via chrome.scripting.executeScript.
 */
export async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return response?.pong === true;
  } catch {
    // Content script not loaded — inject on demand
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/content/content-script.js'],
      });
      return true;
    } catch {
      return false;
    }
  }
}
